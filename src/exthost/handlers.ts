// Penanganan permintaan (`ui/*` yang butuh jawaban) dan peristiwa dari extension host.

import { COMMANDS, openPalette } from "../app/commands";
import * as A from "../app/actions";
import * as E from "../app/editorCommands";
import { clearOutput, logOutput, useOutput } from "../app/output";
import * as docs from "../editor/documents";
import { uriToPath } from "../editor/lsp";
import { openExternal } from "../lib/ipc";
import { ask, getState, promptDialog, setProblemsFrom, setState, stickyToast, toast, type Problem } from "../state/store";
import { tl } from "../i18n";
import { applyHostDecorations, defineDecorationType, removeDecorationType, refreshHostDiagnostics } from "./features";
import { useExtHost, type HostProvider, type StatusItem } from "./state";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const SEVERITY: Problem["severity"][] = ["error", "warning", "info", "info"];

/** Perintah bawaan VS Code yang sering dipanggil ekstensi → padanannya di Alexel Studio. */
async function builtinCommand(command: string, args: Any[]): Promise<unknown> {
  const first = args[0] as Any;
  const asPath = (v: Any): string | null => (v && typeof v === "object" && "$uri" in v ? uriToPath(String(v.$uri)) : typeof v === "string" ? v : null);
  switch (command) {
    case "vscode.open":
    case "vscode.openWith": {
      const p = asPath(first);
      if (p && /^https?:/i.test(String(first?.$uri ?? first))) return openExternal(String(first.$uri ?? first));
      if (p) await A.openFile(p);
      return undefined;
    }
    case "vscode.openFolder": {
      const p = asPath(first);
      if (p) await A.openProject(p);
      return undefined;
    }
    case "editor.action.formatDocument":
    case "editor.action.format":
      return E.format();
    case "editor.action.rename":
      return E.rename();
    case "editor.action.revealDefinition":
    case "editor.action.goToDeclaration":
      return E.definition();
    case "editor.action.goToReferences":
    case "editor.action.referenceSearch.trigger":
      return E.references();
    case "editor.action.triggerSuggest": {
      const { startCompletion } = await import("@codemirror/autocomplete");
      const v = docs.viewOf(getState().focusedGroup);
      if (v) startCompletion(v);
      return undefined;
    }
    case "workbench.action.reloadWindow":
      location.reload();
      return undefined;
    case "workbench.action.openSettings":
    case "workbench.action.openSettings2":
    case "workbench.action.openGlobalSettings":
      return A.openSettings();
    case "workbench.action.openSettingsJson":
      return A.openSettingsJson();
    case "workbench.action.showCommands":
      return openPalette(">");
    case "workbench.action.quickOpen":
      return openPalette("");
    case "workbench.action.files.save":
      return getState().groups[getState().focusedGroup]?.active ? docs.saveDocument(getState().groups[getState().focusedGroup].active!) : undefined;
    case "workbench.action.files.saveAll":
      return A.saveAll();
    case "workbench.action.closeActiveEditor": {
      const id = getState().groups[getState().focusedGroup]?.active;
      return id ? A.closeTab(id, getState().focusedGroup) : undefined;
    }
    case "workbench.view.explorer":
      return A.toggleSidebar("files");
    case "workbench.view.extensions":
      return A.toggleSidebar("ext");
    case "workbench.view.scm":
      return A.toggleSidebar("git");
    case "workbench.view.search":
      return A.toggleSidebar("search");
    case "workbench.action.terminal.toggleTerminal":
    case "workbench.action.terminal.new":
      return (await import("../app/run")).toggleTerminal();
    case "workbench.extensions.installExtension": {
      const id = String(first ?? "");
      const [ns, ...rest] = id.split(".");
      if (!ns || !rest.length) throw new Error("ID ekstensi tidak valid");
      return (await import("../extensions/install")).installExtension(ns, rest.join("."));
    }
    case "workbench.action.openWalkthrough":
    case "workbench.action.focusActiveEditorGroup":
    case "workbench.action.output.toggleOutput":
      return undefined;
  }
  // Perintah Alexel Studio sendiri (id registry).
  const own = COMMANDS.find((c) => c.id === command);
  if (own) return own.run();
  throw new Error(`command '${command}' not found`);
}

const pathOf = (uri: string) => uriToPath(uri);

export async function handleRequest(m: string, p: Any): Promise<unknown> {
  switch (m) {
    case "ui/message": {
      const kind = p.level === "error" ? "error" : p.level === "warn" ? "info" : "info";
      const text = String(p.text);
      const items: string[] = p.items ?? [];
      if (!items.length) {
        toast(text, kind);
        return null;
      }
      if (items.length === 1 && !p.modal) {
        return new Promise((resolve) => {
          let done = false;
          const finish = (v: number | null) => !done && ((done = true), resolve(v));
          toast(text, kind, { label: items[0], run: () => finish(0) });
          setTimeout(() => finish(null), 9500);
        });
      }
      const r = await ask({ kind: "choice", title: p.source ? String(p.source) : tl("Pesan dari ekstensi"), message: text, danger: p.level === "error", choices: items.map((label, i) => ({ id: String(i), label })), cancelLabel: tl("Tutup") });
      return typeof r === "string" ? Number(r) : null;
    }
    case "ui/quickPick":
      return new Promise((resolve) => setState({ quickPick: { items: p.items, canPickMany: !!p.canPickMany, placeHolder: p.placeHolder, title: p.title, resolve } }));
    case "ui/inputBox": {
      let first = true;
      const r = await promptDialog(String(p.title ?? p.prompt ?? tl("Masukkan nilai")), {
        message: p.title && p.prompt ? String(p.prompt) : undefined,
        defaultValue: p.value,
        placeholder: p.placeHolder,
        validate: () => (first && p.error ? ((first = false), String(p.error)) : null),
      });
      return r;
    }
    case "ui/applyEdit": {
      let ok = true;
      for (const f of p.files as { uri: string; edits: docs.WireEdit[] }[]) ok = (await docs.applyTextEdits(pathOf(f.uri), f.edits)) && ok;
      return ok;
    }
    case "ui/saveAll":
      await A.saveAll();
      return null;
    case "ui/showDocument": {
      const sel = p.selection as { s: { l: number; c: number } } | null;
      await A.openFile(pathOf(p.uri), { line: sel ? sel.s.l + 1 : undefined, col: sel ? sel.s.c + 1 : undefined });
      return null;
    }
    case "ui/setSelections":
      docs.setSelectionsAt(pathOf(p.uri), p.selections);
      return null;
    case "ui/insertSnippet": {
      const path = pathOf(p.uri);
      const g = [0, 1].find((i) => docs.shownPath(i) === path);
      const v = g === undefined ? null : docs.viewOf(g);
      if (!v) return false;
      const { snippet } = await import("@codemirror/autocomplete");
      const { convertSnippetBody } = await import("../extensions/registry");
      const at = (pos: { l: number; c: number }) => Math.min(v.state.doc.line(Math.min(pos.l + 1, v.state.doc.lines)).from + pos.c, v.state.doc.length);
      const from = p.range ? at(p.range.s) : v.state.selection.main.from;
      const to = p.range ? at(p.range.e) : v.state.selection.main.to;
      snippet(convertSnippetBody(p.snippet))(v, { label: "snippet" }, from, to);
      return true;
    }
    case "ui/executeCommand":
      return builtinCommand(String(p.command), p.args ?? []);
    case "ui/configUpdate": {
      const cur = getState().settings.extSettings ?? {};
      const next = { ...cur };
      if (p.value === null) delete next[p.key];
      else next[p.key] = p.value;
      A.updateSettings({ extSettings: next });
      return null;
    }
    case "ui/terminalCreate": {
      const { newTerminal } = await import("../terminal/terminals");
      const key = await newTerminal({ kind: "shell", title: p.name || "Terminal", cwd: p.cwd, command: p.shellPath ? `${p.shellPath} ${(p.shellArgs ?? []).join(" ")}` : undefined, focus: false });
      terminalKeys.set(p.id, key);
      return null;
    }
  }
  throw new Error(`permintaan host tidak dikenal: ${m}`);
}

const terminalKeys = new Map<number, string>();
const channelOwners = new Map<string, string>();
const progressToasts = new Map<number, () => void>();

export function handleEvent(e: string, p: Any) {
  const host = useExtHost;
  switch (e) {
    case "ui/output": {
      const name = String(p.channel ?? "Extension Host");
      if (p.source) channelOwners.set(name, p.source);
      if (p.clear) clearOutput(name);
      if (p.text) logOutput(name, String(p.text));
      break;
    }
    case "ui/outputShow":
      useOutput.setState({ channel: String(p.channel) });
      A.togglePanel("output");
      break;
    case "ui/statusItem":
      host.setState((s) => {
        const status = { ...s.status };
        if (p.removed) delete status[p.id];
        else status[p.id] = { ...(status[p.id] ?? {}), ...p } as StatusItem;
        return { status };
      });
      break;
    case "ui/diagnostics": {
      const items = (p.items as Any[]).map((d): Problem => ({ line: d.range.s.l + 1, col: d.range.s.c + 1, message: String(d.message), severity: SEVERITY[d.severity] ?? "error", source: d.source ?? String(p.owner).split(":")[0] }));
      const path = pathOf(p.uri);
      setProblemsFrom(`host:${p.owner}`, path, items);
      hostDiagRaw.set(`${p.owner}|${path}`, p.items);
      if (!p.items.length) hostDiagRaw.delete(`${p.owner}|${path}`);
      refreshHostDiagnostics(path);
      break;
    }
    case "ui/decorationType":
      if (p.removed) removeDecorationType(p.key);
      else defineDecorationType(p.key, p.options);
      break;
    case "ui/decorations":
      applyHostDecorations(pathOf(p.uri), p.type, p.items);
      break;
    case "ui/providerRegistered":
      host.setState((s) => {
        const providers = { ...s.providers };
        if (p.removed) delete providers[p.id];
        else providers[p.id] = p as HostProvider;
        return { providers };
      });
      break;
    case "ui/commandRegistered":
      host.setState((s) => ({ commands: { ...s.commands, [p.id]: { id: p.id, owner: p.owner } } }));
      break;
    case "ui/setContext":
      host.setState((s) => ({ contexts: { ...s.contexts, [p.key]: p.value } }));
      break;
    case "ui/languageConfiguration":
      host.setState((s) => ({ languageConfigs: { ...s.languageConfigs, [p.language]: p.configuration } }));
      break;
    case "ui/extensionActivated":
      host.setState((s) => ({ activated: { ...s.activated, [p.id]: p.ms }, failed: Object.fromEntries(Object.entries(s.failed).filter(([k]) => k !== p.id)) }));
      break;
    case "ui/extensionFailed":
      host.setState((s) => ({ failed: { ...s.failed, [p.id]: p.error } }));
      toast(tl("Ekstensi {id} gagal aktif: {error}", { id: p.id, error: p.error }), "error");
      break;
    case "ui/progress": {
      if (p.done) {
        progressToasts.get(p.id)?.();
        progressToasts.delete(p.id);
        host.setState((s) => {
          const progress = { ...s.progress };
          delete progress[p.id];
          return { progress };
        });
        break;
      }
      host.setState((s) => ({ progress: { ...s.progress, [p.id]: { title: p.title ?? s.progress[p.id]?.title, message: p.message ?? s.progress[p.id]?.message, percent: p.percent ?? s.progress[p.id]?.percent, location: p.location ?? s.progress[p.id]?.location ?? 15 } } }));
      if (!progressToasts.has(p.id) && p.location !== 10 && p.location !== 1) progressToasts.set(p.id, stickyToast(`${p.title ?? ""}${p.message ? ` — ${p.message}` : ""}`));
      break;
    }
    case "ui/terminalSend": {
      const key = terminalKeys.get(p.id);
      if (key) void import("../terminal/terminals").then((m) => m.writeToKey?.(key, p.text + (p.newline ? "\r" : "")));
      break;
    }
    case "ui/terminalShow":
    case "ui/terminalDispose":
      break;
    case "ui/treeRegistered":
      host.setState((s) => {
        const treeViews = { ...s.treeViews };
        if (p.removed) delete treeViews[p.viewId];
        else treeViews[p.viewId] = { owner: p.owner, version: 0 };
        return { treeViews };
      });
      break;
    case "ui/treeChanged":
      host.setState((s) => (s.treeViews[p.viewId] ? { treeViews: { ...s.treeViews, [p.viewId]: { ...s.treeViews[p.viewId], version: s.treeViews[p.viewId].version + 1 } } } : {}));
      break;
    case "ui/webview": {
      void import("./webview").then((w) => {
        if (p.op === "create") w.openWebviewTab(p.id, p.title, p.viewType, p.owner, p.column);
        else if (p.op === "html") w.useWebviews.setState((s) => (s.panels[p.id] ? { panels: { ...s.panels, [p.id]: { ...s.panels[p.id], rev: s.panels[p.id].rev + 1 } } } : {}));
        else if (p.op === "title") {
          w.useWebviews.setState((s) => (s.panels[p.id] ? { panels: { ...s.panels, [p.id]: { ...s.panels[p.id], title: p.title } } } : {}));
          const tid = w.webviewTabId(p.id);
          setState((s) => (s.tabs[tid] ? { tabs: { ...s.tabs, [tid]: { ...s.tabs[tid], name: p.title } } } : {}));
        } else if (p.op === "post") w.postToWebview(p.id, p.message);
        else if (p.op === "reveal") A.showTab(w.webviewTabId(p.id));
        else if (p.op === "dispose") w.closeWebviewTab(p.id);
      });
      break;
    }
    case "ui/reveal": {
      const sel = p.range as { s: { l: number; c: number } };
      void A.openFile(pathOf(p.uri), { line: sel.s.l + 1, col: sel.s.c + 1 });
      break;
    }
  }
}

/** Diagnostik mentah dari host (untuk ditampilkan sebagai garis bergelombang di editor). */
export const hostDiagRaw = new Map<string, Any[]>();
