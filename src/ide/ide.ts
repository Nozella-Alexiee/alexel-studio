// Integrasi IDE untuk agen (sisi renderer): menjawab tool MCP dari CLI (seleksi, berkas terbuka, diagnostik,
// buka berkas, diff untuk disetujui) dan mengirim notifikasi seleksi. Server & lockfile ada di electron/ide.ts.

import * as docs from "../editor/documents";
import { fileUri, uriToPath } from "../editor/lsp";
import { api, call, isNative, on } from "../lib/ipc";
import { basename } from "../lib/paths";
import { getState, setState, toast, useStore } from "../state/store";
import { tl } from "../i18n";
import { vscodeLanguageId } from "../exthost/lang";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface IdeInfo {
  port: number;
  token: string;
}
let info: IdeInfo | null = null;
let wired = false;

export const ideActive = () => !!info;
/** Variabel lingkungan untuk terminal: `claude` di dalamnya otomatis tersambung ke editor. */
export const ideEnv = (): Record<string, string> => (info && getState().settings.ideIntegration ? { CLAUDE_CODE_SSE_PORT: String(info.port), ENABLE_IDE_INTEGRATION: "true" } : {});

type Text = { type: "text"; text: string };
const text = (v: unknown): Text[] => [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v) }];

let latestSelection: unknown = null;

function activeTextPath(): string | null {
  const s = getState();
  const id = s.groups[s.focusedGroup]?.active;
  return id && s.tabs[id]?.kind === "text" ? id : null;
}

function selectionPayload(path: string) {
  const sel = docs.selectionOf(path);
  if (!sel) return null;
  return { text: sel.text, filePath: path, fileUrl: fileUri(path), selection: { start: sel.start, end: sel.end, isEmpty: sel.isEmpty } };
}

const SEVERITY = { error: "Error", warning: "Warning", info: "Information" } as const;

async function openDiffTab(a: { old_file_path: string; new_file_path: string; new_file_contents: string; tab_name: string }): Promise<Text[]> {
  let oldText = "";
  try {
    oldText = (await api.readText(a.old_file_path)).content;
  } catch {
    /* berkas baru */
  }
  const accepted = await new Promise<boolean | "closed">((resolve) => setState({ ideDiff: { tab: a.tab_name, path: a.new_file_path, oldText, newText: a.new_file_contents, resolve } }));
  if (accepted === "closed") return text("TAB_CLOSED");
  if (!accepted) return text("DIFF_REJECTED");
  await api.writeText(a.new_file_path, a.new_file_contents);
  if (docs.getDoc(a.new_file_path)) await docs.reloadFromDisk(a.new_file_path);
  return [{ type: "text", text: "FILE_SAVED" }, { type: "text", text: a.new_file_contents }];
}

function closeDiff(tab?: string): number {
  const d = getState().ideDiff;
  if (!d || (tab && d.tab !== tab)) return 0;
  setState({ ideDiff: null });
  d.resolve("closed");
  return 1;
}

export async function handleIdeTool(tool: string, args: Any): Promise<Text[]> {
  const s = getState();
  switch (tool) {
    case "getWorkspaceFolders":
      return text({ success: true, folders: s.root ? [{ name: basename(s.root), uri: fileUri(s.root), path: s.root }] : [], rootPath: s.root ?? null });
    case "getOpenEditors": {
      const active = activeTextPath();
      const tabs = s.groups.flatMap((g, gi) => g.tabs.filter((id) => s.tabs[id]?.kind === "text").map((id) => ({ uri: fileUri(id), isActive: id === active, isPinned: false, isPreview: false, isDirty: !!s.tabs[id]?.dirty, label: basename(id), groupIndex: gi, viewColumn: gi + 1, isGroupActive: gi === s.focusedGroup, fileName: id, languageId: vscodeLanguageId(id, docs.getDoc(id)?.langId ?? ""), lineCount: (docs.currentText(id) ?? "").split("\n").length, isUntitled: false })));
      return text({ tabs });
    }
    case "getCurrentSelection": {
      const p = activeTextPath();
      const sel = p ? selectionPayload(p) : null;
      return text(sel ? { success: true, ...sel } : { success: false, message: "No active editor found" });
    }
    case "getLatestSelection":
      return text(latestSelection ? { success: true, ...(latestSelection as object) } : { success: false, message: "No selection available" });
    case "getDiagnostics": {
      const one = typeof args?.uri === "string" ? uriToPath(args.uri) : null;
      const entries = Object.entries(s.problems).filter(([p, l]) => l.length && (!one || p === one));
      return text(entries.map(([p, list]) => ({ uri: fileUri(p), diagnostics: list.map((d) => ({ message: d.message, severity: SEVERITY[d.severity] ?? "Information", range: { start: { line: d.line - 1, character: d.col - 1 }, end: { line: d.line - 1, character: d.col } }, source: d.source })) })));
    }
    case "openFile": {
      const path = String(args.filePath);
      const A = await import("../app/actions");
      if (!(await A.openFile(path, { preview: args.preview ? "code" : undefined }))) throw new Error(`Tidak bisa membuka ${path}`);
      if (typeof args.startText === "string" && args.startText) {
        await new Promise((r) => setTimeout(r, 120));
        const t = docs.currentText(path) ?? "";
        const from = t.indexOf(args.startText);
        if (from >= 0) {
          let to = from + args.startText.length;
          if (typeof args.endText === "string" && args.endText) {
            const e = t.indexOf(args.endText, to);
            if (e >= 0) to = e + args.endText.length;
          }
          if (args.selectToEndOfLine) to = (t.indexOf("\n", to) + 1 || t.length + 1) - 1;
          docs.selectRangeIn(path, from, to);
        }
      }
      return text({ success: true, filePath: path });
    }
    case "checkDocumentDirty": {
      const p = String(args.filePath);
      return text({ success: true, filePath: p, isDirty: !!s.tabs[p]?.dirty, isUntitled: false });
    }
    case "saveDocument": {
      const p = String(args.filePath);
      const ok = s.tabs[p] ? await docs.saveDocument(p, { quiet: true }) : false;
      return text({ success: ok, filePath: p, saved: ok, message: ok ? "Document saved" : "Document not open" });
    }
    case "openDiff":
      return openDiffTab(args);
    case "close_tab":
      return text(closeDiff(String(args.tab_name)) ? "TAB_CLOSED" : "NOT_FOUND");
    case "closeAllDiffTabs":
      return text(`CLOSED_${closeDiff()}_DIFF_TABS`);
  }
  throw new Error(`Tool tidak dikenal: ${tool}`);
}

/** Kirim seleksi ke CLI yang tersambung (debounce), dan simpan sebagai "seleksi terakhir". */
let selTimer: number | null = null;
let lastSent = "";
function scheduleSelection() {
  if (selTimer) clearTimeout(selTimer);
  selTimer = window.setTimeout(() => {
    selTimer = null;
    const p = activeTextPath();
    const payload = p ? selectionPayload(p) : null;
    if (!payload) return;
    if (!payload.selection.isEmpty) latestSelection = payload;
    const key = JSON.stringify(payload);
    if (key === lastSent) return;
    lastSent = key;
    void call("ide_notify", { method: "selection_changed", params: payload }).catch(() => {});
  }, 150);
}

/** Kirim @-mention berkas aktif (+ baris yang dipilih) ke CLI di terminal. */
export async function sendAtMention(): Promise<boolean> {
  const p = activeTextPath();
  if (!p) return false;
  const st = await call<{ clients: number }>("ide_status").catch(() => ({ clients: 0 }));
  if (!st.clients) {
    toast(tl("Tidak ada Claude Code yang tersambung. Jalankan `claude` di terminal Alexel Studio."), "info");
    return false;
  }
  const sel = docs.selectionOf(p);
  await call("ide_notify", { method: "at_mentioned", params: { filePath: p, lineStart: sel && !sel.isEmpty ? sel.start.line : null, lineEnd: sel && !sel.isEmpty ? sel.end.line : null } });
  toast(tl("{name} dikirim ke Claude Code.", { name: basename(p) }), "success");
  return true;
}

/** Mulai server IDE untuk project ini (lockfile ditulis ulang saat folder berganti). */
export async function startIde() {
  if (!isNative) return;
  const s = getState();
  if (!s.root || !s.settings.ideIntegration) return;
  try {
    info = await call<IdeInfo>("ide_start", { root: s.root });
  } catch (e) {
    console.warn("Server IDE gagal dimulai", e);
    info = null;
  }
}

export function bootIde() {
  if (!isNative || wired) return;
  wired = true;
  void on<{ id: number; tool: string; args: unknown }>("ide-request", async ({ id, tool, args }) => {
    try {
      await call("ide_reply", { id, result: await handleIdeTool(tool, args) });
    } catch (e) {
      await call("ide_reply", { id, error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    }
  });
  docs.onDocEvent((e) => e.type === "selection" && scheduleSelection());
  let last = "";
  let root = getState().root;
  let enabled = getState().settings.ideIntegration;
  useStore.subscribe((st) => {
    const id = st.groups[st.focusedGroup]?.active ?? "";
    if (id !== last) {
      last = id;
      requestAnimationFrame(() => requestAnimationFrame(scheduleSelection));
    }
    if (st.root !== root) {
      root = st.root;
      void startIde();
    }
    if (st.settings.ideIntegration !== enabled) {
      enabled = st.settings.ideIntegration;
      if (enabled) void startIde();
      else {
        info = null;
        void call("ide_stop").catch(() => {});
      }
    }
  });
  void startIde();
}

/** Keputusan pemakai untuk diff dari agen (dipanggil dari IdeDiffHost). */
export function resolveIdeDiff(accepted: boolean) {
  const d = getState().ideDiff;
  if (!d) return;
  setState({ ideDiff: null });
  d.resolve(accepted);
}
