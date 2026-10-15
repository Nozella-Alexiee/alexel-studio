// Klien LSP di renderer: satu LSPClient per (server, folder project), transport lewat IPC.
// Memberi autocomplete, hover, signature help, go-to-definition (F12), rename (F2),
// format (⇧⌥F), dan diagnostik asli yang masuk ke panel Masalah.

import { LSPClient, LSPPlugin, Workspace, jumpToDefinition, languageServerExtensions, type Transport, type WorkspaceFile } from "@codemirror/lsp-client";
import type { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import DOMPurify from "dompurify";
import { call, isNative, on } from "../lib/ipc";
import { extname, isInside } from "../lib/paths";
import { getState, setState, type Problem } from "../state/store";
import { tl } from "../i18n";

export interface ServerStatus {
  id: string;
  name: string;
  langs: string[];
  available: boolean;
  bundled: boolean;
  install: string | null;
}

let statusCache: Promise<ServerStatus[]> | null = null;
export function serverStatus(refresh = false): Promise<ServerStatus[]> {
  if (!isNative) return Promise.resolve([]);
  if (!statusCache || refresh) statusCache = call<ServerStatus[]>("lsp_status").catch(() => []);
  return statusCache;
}

/** "/a/b.ts" → "file:///a/b.ts"; "C:/a/b.ts" → "file:///C:/a/b.ts" (titik dua drive tidak di-encode). */
export const fileUri = (path: string) => {
  const drive = /^[A-Za-z]:\//.test(path);
  const segs = path.split("/").map((seg, i) => (drive && i === 0 ? seg : encodeURIComponent(seg)));
  return "file://" + (drive ? "/" : "") + segs.join("/");
};
/** Kebalikan fileUri; server sering mengirim "file:///c%3A/..." untuk Windows. */
export const uriToPath = (uri: string) => {
  const p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
  const m = /^\/([A-Za-z]):\//.exec(p);
  return m ? m[1].toUpperCase() + p.slice(2) : p;
};

export function languageIdFor(path: string, langId: string): string {
  const ext = extname(path);
  if (langId === "ts") return ext === "tsx" ? "typescriptreact" : "typescript";
  if (langId === "js") return ext === "jsx" ? "javascriptreact" : "javascript";
  return ({ py: "python", php: "php", rs: "rust", go: "go", c: "c", cpp: "cpp", css: "css" } as Record<string, string>)[langId] ?? langId;
}

const SEVERITY: Record<number, Problem["severity"]> = { 1: "error", 2: "warning", 3: "info", 4: "info" };

class NozelWorkspaceFile implements WorkspaceFile {
  constructor(
    public uri: string,
    public languageId: string,
    public version: number,
    public doc: Text,
    public view: EditorView
  ) {}
  getView() {
    return this.view;
  }
}

/** Seperti workspace bawaan, tapi: tidak error kalau berkas tampil di dua grup, dan
 *  "lompat ke definisi" membuka berkas lain sebagai tab Nozel. */
class NozelWorkspace extends Workspace {
  files: NozelWorkspaceFile[] = [];
  private versions: Record<string, number> = Object.create(null);
  private next(uri: string) {
    return (this.versions[uri] = (this.versions[uri] ?? -1) + 1);
  }
  syncFiles() {
    const out = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        out.push({ changes, file, prevDoc: file.doc });
        file.doc = file.view.state.doc;
        file.version = this.next(file.uri);
        plugin.clear();
      }
    }
    return out;
  }
  openFile(uri: string, languageId: string, view: EditorView) {
    if (this.getFile(uri)) return;
    const f = new NozelWorkspaceFile(uri, languageId, this.next(uri), view.state.doc, view);
    this.files.push(f);
    this.client.didOpen(f);
  }
  closeFile(uri: string, view: EditorView) {
    const f = this.files.find((x) => x.uri === uri);
    if (f && f.view === view) {
      this.files = this.files.filter((x) => x !== f);
      this.client.didClose(uri);
    }
  }
  async displayFile(uri: string): Promise<EditorView | null> {
    const path = uriToPath(uri);
    const A = await import("../app/actions");
    if (!(await A.openFile(path))) return null;
    const docs = await import("./documents");
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const g = getState().focusedGroup;
      if (docs.shownPath(g) === path) return docs.viewOf(g);
    }
    return null;
  }
}

const clients = new Map<string, Promise<LSPClient | null>>();
let listening = false;
const handlers = new Map<string, Set<(m: string) => void>>();

function ensureListener() {
  if (listening) return;
  listening = true;
  void on<{ key: string; message: string }>("lsp-message", ({ key, message }) => handlers.get(key)?.forEach((h) => h(message)));
  void on<{ key: string; text: string }>("lsp-log", ({ key, text }) => void import("../app/output").then((m) => m.logOutput("Server bahasa", `${key.split("::")[0]}: ${text}`)));
  void on<{ key: string }>("lsp-exit", ({ key }) => {
    // Kunci klien sama dengan kunci di main process ("server::root").
    clients.delete(key);
    handlers.delete(key);
  });
}

function setProblems(path: string, list: Problem[]) {
  setState((s) => ({ problems: { ...s.problems, [path]: list } }));
}

async function getClient(serverId: string, root: string): Promise<LSPClient | null> {
  const id = `${serverId}::${root}`;
  let p = clients.get(id);
  if (!p) {
    p = (async () => {
      ensureListener();
      try {
        const { key, initializationOptions } = await call<{ key: string; initializationOptions: unknown }>("lsp_start", { serverId, root });
        const subs = new Set<(m: string) => void>();
        handlers.set(key, subs);
        const transport: Transport = {
          send: (message) => void call("lsp_send", { key, message }).catch(() => {}),
          subscribe: (h) => subs.add(h),
          unsubscribe: (h) => subs.delete(h),
        };
        const client = new LSPClient({
          rootUri: fileUri(root),
          initializationOptions,
          timeout: 8000,
          workspace: (c) => new NozelWorkspace(c),
          sanitizeHTML: (html) => DOMPurify.sanitize(html),
          extensions: languageServerExtensions(),
          notificationHandlers: {
            "textDocument/publishDiagnostics": (_c, params: { uri: string; diagnostics: { range: { start: { line: number; character: number } }; severity?: number; message: string; source?: string }[] }) => {
              setProblems(
                uriToPath(params.uri),
                params.diagnostics.map((d) => ({ line: d.range.start.line + 1, col: d.range.start.character + 1, message: d.message, severity: SEVERITY[d.severity ?? 1] ?? "error", source: d.source ?? serverId }))
              );
              return false; // biarkan handler bawaan juga menampilkan di editor
            },
          },
        });
        client.connect(transport);
        return client;
      } catch (e) {
        console.warn("LSP gagal dimulai", serverId, e);
        void import("../app/output").then((m) => m.logOutput("Server bahasa", tl("{name} gagal dimulai: {error}", { name: serverId, error: e instanceof Error ? e.message : String(e) })));
        return null;
      }
    })();
    clients.set(id, p);
  }
  return p;
}

/** ⌘+klik = lompat ke definisi. */
const cmdClickDefinition = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey) || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return false;
    e.preventDefault();
    view.dispatch({ selection: { anchor: pos } });
    jumpToDefinition(view);
    return true;
  },
});

/** Ekstensi LSP untuk satu dokumen, atau null kalau tidak ada server yang tersedia. */
export async function lspFor(path: string, langId: string) {
  const root = getState().root;
  if (!isNative || !root || !isInside(root, path) || path === root) return null;
  const st = (await serverStatus()).find((s) => s.available && s.langs.includes(langId));
  if (!st) return null;
  const client = await getClient(st.id, root);
  if (!client) return null;
  return { client, server: st, extension: [client.plugin(fileUri(path), languageIdFor(path, langId)), cmdClickDefinition] };
}

export interface WorkspaceSymbol {
  name: string;
  kind: string;
  container?: string;
  path: string;
  line: number;
  col: number;
}

const SYMBOL_KINDS: Record<number, string> = { 2: "modul", 3: "namespace", 5: "kelas", 6: "method", 7: "properti", 8: "field", 9: "constructor", 10: "enum", 11: "interface", 12: "fungsi", 13: "variabel", 14: "konstanta", 23: "struct", 26: "tipe" };

/** Cari simbol di seluruh project lewat semua server bahasa yang sedang berjalan (workspace/symbol). */
export async function workspaceSymbols(query: string): Promise<WorkspaceSymbol[]> {
  const out: WorkspaceSymbol[] = [];
  for (const p of clients.values()) {
    const c = await p;
    if (!c) continue;
    try {
      const res = (await c.request("workspace/symbol", { query })) as { name: string; kind: number; containerName?: string; location: { uri: string; range?: { start: { line: number; character: number } } } }[] | null;
      for (const s of res ?? []) {
        if (!s.location?.uri?.startsWith("file:")) continue;
        out.push({ name: s.name, kind: SYMBOL_KINDS[s.kind] ?? "simbol", container: s.containerName || undefined, path: uriToPath(s.location.uri), line: (s.location.range?.start.line ?? 0) + 1, col: (s.location.range?.start.character ?? 0) + 1 });
      }
    } catch {
      /* server tidak mendukung workspace/symbol */
    }
  }
  return out.slice(0, 200);
}

/** Matikan semua server saat ganti/tutup project. */
export async function stopAllLsp() {
  for (const [id, p] of clients) {
    const c = await p;
    c?.disconnect();
    void call("lsp_stop", { key: id }).catch(() => {});
  }
  clients.clear();
}
