// Proses extension host: dijalankan sebagai child process (Node bawaan Electron) oleh main process.
// Memuat ekstensi VS Code yang dipercaya pemakai, menyediakan modul `vscode` (subset), dan
// menjembatani fitur bahasa/UI ke editor lewat RPC. Lihat SECURITY.md soal model kepercayaan.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { buildApi, buildContext, runCommand } from "./api";
import { languageFromPath } from "./api-workspace";
import { newEvents, type EditorInfo, type ExtManifest, type HostCtx, type LoadedExt } from "./context";
import * as C from "./convert";
import { HostDocument } from "./document";
import { globMatch } from "./glob";
import { Rpc, type Msg } from "./rpc";
import { matchSelector, type DocumentFilter } from "./selector";
import * as T from "./types";
import { Uri } from "./uri";

const send = (m: Msg) => {
  if (process.send) process.send(m);
};
const rpc = new Rpc(send);

const hc: HostCtx = {
  rpc,
  root: null,
  userData: "",
  extensions: new Map(),
  docs: new Map(),
  commands: new Map(),
  providers: new Map(),
  diagnostics: new Map(),
  settings: {},
  defaults: new Map(),
  activeEditor: null,
  decorationTypes: new Map(),
  treeProviders: new Map(),
  events: newEvents(),
  activate: (id, reason) => activate(id, reason),
  activateByEvent: (event) => activateByEvent(event),
  log: (ext, line) => rpc.notify("ui/output", { channel: "Extension Host", source: ext?.id, text: `${ext ? `[${ext.id}] ` : ""}${line}\n` }),
  positionOf: (p) => new T.Position(p.l, p.c),
};

// ---- modul `vscode` ----------------------------------------------------------------------

const M = Module as unknown as { _load: (request: string, parent: { filename?: string } | null, isMain: boolean) => unknown };
const origLoad = M._load;
const extByFile = (file: string | undefined): LoadedExt | null => {
  if (!file) return null;
  let best: LoadedExt | null = null;
  for (const e of hc.extensions.values()) if (file.startsWith(e.dir + path.sep) && (!best || e.dir.length > best.dir.length)) best = e;
  return best;
};
M._load = function (request, parent, isMain) {
  if (request === "vscode") return buildApi(hc, extByFile(parent?.filename));
  return origLoad.call(this, request, parent, isMain);
};

// Galat tak tertangkap dari kode ekstensi tidak boleh menjatuhkan host.
process.on("uncaughtException", (e) => hc.log(null, `uncaughtException: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));
process.on("unhandledRejection", (e) => hc.log(null, `unhandledRejection: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));

// ---- aktivasi ----------------------------------------------------------------------------

const hasEvent = (e: LoadedExt, event: string): boolean => {
  const events = e.manifest.activationEvents ?? [];
  if (events.includes(event)) return true;
  // Perintah yang dideklarasikan di contributes.commands otomatis memicu aktivasi (VS Code ≥ 1.74).
  if (event.startsWith("onCommand:")) {
    const id = event.slice("onCommand:".length);
    return (e.manifest.contributes?.commands ?? []).some((c: { command?: string }) => c.command === id);
  }
  return false;
};

async function activate(id: string, reason = "manual"): Promise<void> {
  const ext = [...hc.extensions.values()].find((e) => e.id.toLowerCase() === id.toLowerCase());
  if (!ext || ext.active) return;
  if (ext.activating) return ext.activating;
  ext.activating = (async () => {
    for (const dep of ext.manifest.extensionDependencies ?? []) await activate(dep, `dependency of ${ext.id}`);
    const started = Date.now();
    try {
      if (!ext.manifest.main) {
        ext.active = true;
        return;
      }
      const mainFile = path.resolve(ext.dir, ext.manifest.main);
      const req = Module.createRequire(path.join(ext.dir, "package.json"));
      const mod = req(mainFile) as { activate?: (ctx: unknown) => unknown } | undefined;
      ext.context = buildContext(hc, ext);
      ext.exports = typeof mod?.activate === "function" ? await mod.activate(ext.context) : mod;
      ext.active = true;
      hc.log(ext, `activated (${reason}) in ${Date.now() - started} ms`);
      rpc.notify("ui/extensionActivated", { id: ext.id, ms: Date.now() - started });
    } catch (e) {
      const msg = e instanceof Error ? e.stack ?? e.message : String(e);
      hc.log(ext, `activation failed: ${msg}`);
      rpc.notify("ui/extensionFailed", { id: ext.id, error: e instanceof Error ? e.message : String(e) });
    } finally {
      ext.activating = null;
    }
  })();
  return ext.activating;
}

async function activateByEvent(event: string): Promise<void> {
  const targets = [...hc.extensions.values()].filter((e) => !e.active && hasEvent(e, event));
  await Promise.all(targets.map((e) => activate(e.id, event)));
}

async function activateStartup() {
  await activateByEvent("*");
  await activateByEvent("onStartupFinished");
  // workspaceContains:<glob>
  if (hc.root) {
    for (const e of hc.extensions.values()) {
      if (e.active) continue;
      for (const ev of e.manifest.activationEvents ?? []) {
        if (!ev.startsWith("workspaceContains:")) continue;
        if (workspaceContains(hc.root, ev.slice("workspaceContains:".length))) {
          void activate(e.id, ev);
          break;
        }
      }
    }
  }
}

function workspaceContains(root: string, glob: string, depth = 0, rel = ""): boolean {
  if (depth > 6) return false;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (globMatch(glob, r)) return true;
    if (e.isDirectory() && glob.includes("/") && workspaceContains(root, glob, depth + 1, r)) return true;
  }
  return false;
}

// ---- dokumen -----------------------------------------------------------------------------

const docOf = (uri: string): HostDocument => {
  let d = hc.docs.get(uri);
  if (!d) {
    const u = Uri.parse(uri);
    const text = fs.readFileSync(u.fsPath, "utf8");
    d = new HostDocument(u, languageFromPath(u.fsPath), 1, text, text.includes("\r\n") ? 2 : 1);
    hc.docs.set(uri, d);
  }
  return d;
};

interface WireChange {
  start: number;
  end: number;
  text: string;
}

rpc.requests.set("init", (p: { extensions: { id: string; dir: string; manifest: ExtManifest }[]; root: string | null; userData: string; settings: Record<string, unknown> }) => {
  hc.root = p.root;
  hc.userData = p.userData;
  hc.settings = p.settings ?? {};
  hc.extensions.clear();
  hc.defaults.clear();
  for (const e of p.extensions) {
    let real = e.dir;
    try {
      real = fs.realpathSync(e.dir); // require() resolve symlink (mis. /var → /private/var di macOS)
    } catch {
      /* pakai apa adanya */
    }
    hc.extensions.set(e.id, { id: e.id, dir: real, manifest: e.manifest, active: false, activating: null, exports: undefined, context: undefined, subscriptions: [] });
    const conf = e.manifest.contributes?.configuration;
    for (const block of Array.isArray(conf) ? conf : conf ? [conf] : []) for (const [k, v] of Object.entries((block as { properties?: Record<string, { default?: unknown }> }).properties ?? {})) if (v && "default" in v) hc.defaults.set(k, v.default);
  }
  return { ok: true, count: hc.extensions.size };
});
rpc.requests.set("startup", async () => {
  await activateStartup();
  return true;
});
rpc.requests.set("activate", async (p: { id: string }) => {
  await activate(p.id, "ui");
  return hc.extensions.get(p.id)?.active ?? false;
});

rpc.events.set("doc/open", async (p: { uri: string; languageId: string; version: number; text: string; eol: 1 | 2 }) => {
  const doc = new HostDocument(Uri.parse(p.uri), p.languageId, p.version, p.text, p.eol);
  doc.isOpenInEditor = true;
  hc.docs.set(p.uri, doc);
  hc.events.openDoc.fire(doc);
  await activateByEvent(`onLanguage:${p.languageId}`);
});
rpc.events.set("doc/change", (p: { uri: string; version: number; changes: WireChange[]; text?: string }) => {
  const doc = hc.docs.get(p.uri);
  if (!doc) return;
  const contentChanges = p.changes.map((c) => {
    const start = doc.positionAt(c.start);
    const end = doc.positionAt(c.end);
    return { range: new T.Range(start, end), rangeOffset: c.start, rangeLength: c.end - c.start, text: c.text };
  });
  if (p.text !== undefined) doc.setText(p.text, p.version);
  else doc.applyEdits(p.changes, p.version);
  doc.isDirty = true;
  hc.events.changeDoc.fire({ document: doc, contentChanges, reason: undefined });
});
rpc.events.set("doc/save", (p: { uri: string }) => {
  const doc = hc.docs.get(p.uri);
  if (!doc) return;
  doc.isDirty = false;
  hc.events.saveDoc.fire(doc);
});
rpc.events.set("doc/close", (p: { uri: string }) => {
  const doc = hc.docs.get(p.uri);
  if (!doc) return;
  doc.isClosed = true;
  doc.isOpenInEditor = false;
  hc.docs.delete(p.uri);
  hc.events.closeDoc.fire(doc);
});
rpc.events.set("editor/active", (p: EditorInfo | null) => {
  hc.activeEditor = p;
  const win = buildApi(hc, null).window as { activeTextEditor?: unknown };
  hc.events.activeEditor.fire(p ? win.activeTextEditor : undefined);
});
rpc.events.set("editor/selection", (p: EditorInfo) => {
  hc.activeEditor = p;
  const win = buildApi(hc, null).window as { activeTextEditor?: { selections: T.Selection[] } };
  const ed = win.activeTextEditor;
  if (!ed) return;
  ed.selections = p.selections.map((s) => new T.Selection(new T.Position(s.anchor.l, s.anchor.c), new T.Position(s.active.l, s.active.c)));
  hc.events.selection.fire({ textEditor: ed, selections: ed.selections, kind: undefined });
});
rpc.events.set("config/set", (p: { settings: Record<string, unknown> }) => {
  const before = hc.settings;
  hc.settings = p.settings ?? {};
  const changed = new Set<string>([...Object.keys(before), ...Object.keys(hc.settings)].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(hc.settings[k])));
  if (changed.size) hc.events.config.fire({ affectsConfiguration: (s: string) => [...changed].some((k) => k === s || k.startsWith(s + ".") || s.startsWith(k + ".")) });
});
rpc.events.set("fs/changed", (p: { kind: "create" | "change" | "delete"; path: string }) => hc.events.fsChanged.fire({ kind: p.kind, uri: Uri.file(p.path) }));

rpc.requests.set("command/execute", (p: { id: string; args?: unknown[] }) => runCommand(hc, p.id, p.args ?? []));
rpc.requests.set("commands/list", () => [...hc.commands.keys()]);

// ---- provider ----------------------------------------------------------------------------

const token = { isCancellationRequested: false, onCancellationRequested: new T.EventEmitter<unknown>().event };
const withTimeout = <R>(p: Promise<R> | R, ms = 15_000): Promise<R> => Promise.race([Promise.resolve(p), new Promise<R>((_r, rej) => setTimeout(() => rej(new Error("provider timeout")), ms))]);

function providersFor(kind: string, doc: HostDocument) {
  return [...hc.providers.values()].filter((p) => p.kind === kind && matchSelector(p.selector as DocumentFilter[], doc));
}

async function collect<R>(kind: string, doc: HostDocument, call: (provider: any) => unknown): Promise<R[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: R[] = [];
  for (const p of providersFor(kind, doc)) {
    await activateByEventOwner(p.ext);
    try {
      const r = await withTimeout(call(p.provider) as Promise<R>);
      if (r !== undefined && r !== null) out.push(r);
    } catch (e) {
      hc.log(p.ext, `${kind} provider error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
const activateByEventOwner = async (_e: LoadedExt | null) => {};

const symbol = (s: T.DocumentSymbol | T.SymbolInformation): unknown => {
  if (s instanceof T.SymbolInformation) return { name: s.name, detail: s.containerName, kind: s.kind, range: C.range(s.location.range), selection: C.range(s.location.range), children: [] };
  return { name: s.name, detail: s.detail, kind: s.kind, range: C.range(s.range), selection: C.range(s.selectionRange), children: (s.children ?? []).map(symbol) };
};

const asEditFiles = (e: T.WorkspaceEdit | undefined | null) => (e ? e.entries().map(([u, list]) => ({ uri: u.toString(), edits: C.edits(list) })) : []);

rpc.requests.set("provide", async (p: { kind: string; uri: string; pos?: C.JPos; range?: C.JRange; opts?: Record<string, any>; text?: string }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const doc = docOf(p.uri);
  const pos = p.pos ? C.toPos(p.pos) : new T.Position(0, 0);
  const o = p.opts ?? {};
  switch (p.kind) {
    case "completion": {
      const ctx = { triggerKind: o.character ? T.CompletionTriggerKind.TriggerCharacter : T.CompletionTriggerKind.Invoke, triggerCharacter: o.character };
      const lists = await collect<T.CompletionItem[] | T.CompletionList>("completion", doc, (pr) => pr.provideCompletionItems?.(doc, pos, token, ctx));
      const items = lists.flatMap((l) => (Array.isArray(l) ? l : l.items));
      return { items: items.slice(0, 500).map(C.completion), incomplete: lists.some((l) => !Array.isArray(l) && l.isIncomplete) };
    }
    case "hover": {
      const hs = await collect<T.Hover | T.Hover[]>("hover", doc, (pr) => pr.provideHover?.(doc, pos, token));
      const all = hs.flatMap((h) => (Array.isArray(h) ? h : [h]));
      if (!all.length) return null;
      return { contents: all.flatMap((h) => h.contents.map(C.md)).filter(Boolean), range: all[0].range ? C.range(all[0].range) : null };
    }
    case "definition":
    case "declaration":
    case "typeDefinition":
    case "implementation": {
      const fn = { definition: "provideDefinition", declaration: "provideDeclaration", typeDefinition: "provideTypeDefinition", implementation: "provideImplementation" }[p.kind]!;
      return (await collect<unknown>(p.kind, doc, (pr) => pr[fn]?.(doc, pos, token))).flatMap(C.locations);
    }
    case "references":
      return (await collect<unknown>("references", doc, (pr) => pr.provideReferences?.(doc, pos, { includeDeclaration: o.includeDeclaration !== false }, token))).flatMap(C.locations);
    case "formatting": {
      const r = await collect<T.TextEdit[]>("formatting", doc, (pr) => pr.provideDocumentFormattingEdits?.(doc, { tabSize: o.tabSize ?? 2, insertSpaces: o.insertSpaces !== false }, token));
      return r.flatMap((e) => C.edits(e));
    }
    case "rangeFormatting": {
      const range = C.toRange(p.range!);
      const r = await collect<T.TextEdit[]>("rangeFormatting", doc, (pr) => pr.provideDocumentRangeFormattingEdits?.(doc, range, { tabSize: o.tabSize ?? 2, insertSpaces: o.insertSpaces !== false }, token));
      return r.flatMap((e) => C.edits(e));
    }
    case "codeAction": {
      const range = p.range ? C.toRange(p.range) : new T.Range(pos, pos);
      const diags: T.Diagnostic[] = ((o.diagnostics ?? []) as { range: C.JRange; message: string; severity: number; source?: string; code?: string }[]).map((d) => Object.assign(new T.Diagnostic(C.toRange(d.range), d.message, d.severity), { source: d.source, code: d.code }));
      const ctx = { diagnostics: diags, only: o.only ? new T.CodeActionKind(o.only) : undefined, triggerKind: T.CodeActionTriggerKind.Invoke };
      const lists = await collect<(T.CodeAction | { command: string; title: string; arguments?: unknown[] })[]>("codeAction", doc, (pr) => pr.provideCodeActions?.(doc, range, ctx, token));
      return lists.flat().map((a) => {
        const act = a as T.CodeAction & { command?: { command: string; arguments?: unknown[]; title?: string } };
        const isCmd = typeof (a as { command?: unknown }).command === "string";
        return {
          title: act.title ?? (a as { title: string }).title,
          kind: act.kind?.value,
          preferred: !!act.isPreferred,
          files: act.edit ? asEditFiles(act.edit) : [],
          command: isCmd ? { command: (a as { command: string }).command, arguments: (a as { arguments?: unknown[] }).arguments } : act.command ? { command: act.command.command, arguments: act.command.arguments } : undefined,
        };
      });
    }
    case "documentSymbol": {
      const lists = await collect<(T.DocumentSymbol | T.SymbolInformation)[]>("documentSymbol", doc, (pr) => pr.provideDocumentSymbols?.(doc, token));
      return lists.flat().map(symbol);
    }
    case "rename": {
      for (const pr of providersFor("rename", doc)) {
        try {
          const edit = await withTimeout(pr.provider.provideRenameEdits?.(doc, pos, String(o.newName), token));
          if (edit) return { files: asEditFiles(edit as T.WorkspaceEdit) };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e), files: [] };
        }
      }
      return { files: [] };
    }
    case "prepareRename": {
      for (const pr of providersFor("rename", doc)) {
        if (!pr.provider.prepareRename) return { range: null };
        try {
          const r = (await withTimeout(pr.provider.prepareRename(doc, pos, token))) as T.Range | { range: T.Range; placeholder: string } | undefined;
          if (!r) return null;
          return r instanceof T.Range ? { range: C.range(r) } : { range: C.range(r.range), placeholder: r.placeholder };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return null;
    }
    case "signatureHelp": {
      const r = await collect<{ signatures: { label: string; documentation?: unknown; parameters?: { label: string | [number, number]; documentation?: unknown }[] }[]; activeSignature?: number; activeParameter?: number }>("signatureHelp", doc, (pr) => pr.provideSignatureHelp?.(doc, pos, token, { triggerKind: 1, isRetrigger: false, triggerCharacter: o.character }));
      const h = r[0];
      if (!h) return null;
      return { signatures: h.signatures.map((s) => ({ label: s.label, doc: s.documentation ? C.md(s.documentation) : undefined, parameters: (s.parameters ?? []).map((q) => ({ label: q.label, doc: q.documentation ? C.md(q.documentation) : undefined })) })), activeSignature: h.activeSignature ?? 0, activeParameter: h.activeParameter ?? 0 };
    }
    case "codeLens": {
      const lists = await collect<T.CodeLens[]>("codeLens", doc, async (pr) => {
        const lenses = (await pr.provideCodeLenses?.(doc, token)) as T.CodeLens[] | undefined;
        if (lenses && pr.resolveCodeLens) for (const l of lenses) if (!l.command) await pr.resolveCodeLens(l, token);
        return lenses;
      });
      return lists.flat().filter((l) => l.command).map((l) => ({ range: C.range(l.range), title: l.command!.title, command: l.command!.command, arguments: l.command!.arguments }));
    }
    case "documentHighlight": {
      const lists = await collect<T.DocumentHighlight[]>("documentHighlight", doc, (pr) => pr.provideDocumentHighlights?.(doc, pos, token));
      return lists.flat().map((h) => ({ range: C.range(h.range), kind: h.kind }));
    }
    case "documentLink": {
      const lists = await collect<T.DocumentLink[]>("documentLink", doc, (pr) => pr.provideDocumentLinks?.(doc, token));
      return lists.flat().filter((l) => l.target).map((l) => ({ range: C.range(l.range), target: l.target!.toString() }));
    }
    case "foldingRange": {
      const lists = await collect<{ start: number; end: number; kind?: number }[]>("foldingRange", doc, (pr) => pr.provideFoldingRanges?.(doc, {}, token));
      return lists.flat();
    }
    case "inlayHints": {
      const range = p.range ? C.toRange(p.range) : new T.Range(0, 0, doc.lineCount, 0);
      const lists = await collect<{ position: T.Position; label: string | { value: string }[]; kind?: number; paddingLeft?: boolean; paddingRight?: boolean }[]>("inlayHints", doc, (pr) => pr.provideInlayHints?.(doc, range, token));
      return lists.flat().map((h) => ({ pos: C.pos(h.position), label: typeof h.label === "string" ? h.label : h.label.map((x) => x.value).join(""), kind: h.kind, left: !!h.paddingLeft, right: !!h.paddingRight }));
    }
    default:
      return null;
  }
});

// ---- TreeView (panel Ekstensi di sidebar) -------------------------------------------------

rpc.requests.set("tree/children", async (p: { viewId: string; element?: string }) => {
  const entry = hc.treeProviders.get(p.viewId);
  if (!entry) return [];
  await activateByEvent(`onView:${p.viewId}`);
  const elements = elementsByKey.get(p.viewId) ?? new Map<string, unknown>();
  elementsByKey.set(p.viewId, elements);
  const parent = p.element ? elements.get(p.element) : undefined;
  const children = ((await withTimeout(entry.provider.getChildren(parent))) ?? []) as unknown[];
  const out = [];
  for (const el of children) {
    const item = (await withTimeout(entry.provider.getTreeItem(el))) as T.TreeItem & { id?: string; description?: string | boolean; tooltip?: unknown; command?: { command: string; arguments?: unknown[] }; contextValue?: string; iconPath?: unknown; resourceUri?: Uri };
    const label = typeof item.label === "string" ? item.label : item.label?.label ?? "";
    const key: string = item.id ?? `${p.element ?? ""}/${label}/${out.length}`;
    elements.set(key, el);
    out.push({ key, label, description: typeof item.description === "string" ? item.description : undefined, collapsible: item.collapsibleState, command: item.command ? { command: item.command.command, arguments: item.command.arguments } : undefined, contextValue: item.contextValue, tooltip: typeof item.tooltip === "string" ? item.tooltip : (item.tooltip as { value?: string } | undefined)?.value, icon: typeof item.iconPath === "object" && item.iconPath && "id" in item.iconPath ? (item.iconPath as { id: string }).id : undefined, resource: item.resourceUri?.toString() });
  }
  return out;
});
const elementsByKey = new Map<string, Map<string, unknown>>();

rpc.requests.set("shutdown", async () => {
  for (const e of hc.extensions.values()) {
    try {
      const mod = (() => {
        try {
          return e.manifest.main ? (Module.createRequire(path.join(e.dir, "package.json"))(path.resolve(e.dir, e.manifest.main)) as { deactivate?: () => unknown }) : undefined;
        } catch {
          return undefined;
        }
      })();
      if (e.active) await withTimeout(mod?.deactivate?.(), 2000).catch(() => {});
      for (const s of e.subscriptions.reverse()) try { s?.dispose?.(); } catch { /* abaikan */ }
      e.mementos?.forEach((m) => m.flush());
    } catch {
      /* lanjut */
    }
  }
  return true;
});

process.on("message", (m: Msg) => rpc.receive(m));
process.on("disconnect", () => process.exit(0));
rpc.notify("ready", { pid: process.pid });
