// vscode.window: pesan, quick pick, input, output channel, status bar, progress, editor, dekorasi, terminal.

import type { HostCtx, LoadedExt } from "./context";
import { edits as jEdits, range as jRange, toRange } from "./convert";
import type { HostDocument } from "./document";
import { ownerHost } from "./webviews";
import { CancellationTokenSource, Disposable, EventEmitter, Position, Range, Selection, StatusBarAlignment, TextEdit, ThemeColor, ViewColumn } from "./types";
import { Uri } from "./uri";

let seq = 0;
const nextId = () => ++seq;
/** Satu peta editor per host: semua ekstensi melihat objek TextEditor yang sama (seleksi ikut kursor). */
const sharedEditors = new WeakMap<object, Map<string, unknown>>();

type Thenable<T> = PromiseLike<T>;
type MessageItem = string | { title: string; isCloseAffordance?: boolean; [k: string]: unknown };

export function windowApi(hc: HostCtx, ext: LoadedExt | null) {
  const rpc = hc.rpc;
  const prefix = ext ? `[${ext.id}] ` : "";

  const message = (level: "info" | "warn" | "error") => async (text: string, ...rest: unknown[]) => {
    const items = rest.filter((x) => typeof x === "string" || (x && typeof x === "object" && "title" in (x as object))) as MessageItem[];
    const options = rest.find((x) => x && typeof x === "object" && !("title" in (x as object)) && !Array.isArray(x)) as { modal?: boolean } | undefined;
    const labels = items.map((i) => (typeof i === "string" ? i : i.title));
    // Tanpa batas waktu: pemakai boleh menjawab kapan saja (default RPC 120 dtk akan menolak janji ekstensi).
    const picked = await rpc.request<number | null>("ui/message", { level, text: String(text), items: labels, modal: !!options?.modal, source: ext?.manifest.displayName ?? ext?.id }, 0);
    return picked == null || picked < 0 ? undefined : items[picked];
  };

  const editors = ((): Map<string, TextEditorImpl> => {
    let m = sharedEditors.get(hc);
    if (!m) sharedEditors.set(hc, (m = new Map()));
    return m as Map<string, TextEditorImpl>;
  })();
  class TextEditorImpl {
    selections: Selection[];
    visibleRanges: Range[] = [];
    options: { tabSize: number; insertSpaces: boolean; cursorStyle?: number; lineNumbers?: number };
    viewColumn = ViewColumn.One;
    constructor(readonly document: HostDocument, info?: import("./context").EditorInfo) {
      this.selections = info ? info.selections.map((s) => new Selection(new Position(s.anchor.l, s.anchor.c), new Position(s.active.l, s.active.c))) : [new Selection(new Position(0, 0), new Position(0, 0))];
      this.options = info?.options ?? { tabSize: 2, insertSpaces: true };
      if (info?.visible) this.visibleRanges = info.visible.map(toRange);
    }
    get selection() {
      return this.selections[0];
    }
    set selection(s: Selection) {
      this.selections = [s];
      void rpc.request("ui/setSelections", { uri: this.document.uri.toString(), selections: [{ anchor: { l: s.anchor.line, c: s.anchor.character }, active: { l: s.active.line, c: s.active.character } }] }).catch(() => {});
    }
    async edit(cb: (b: { replace(r: Range | Position | Selection, t: string): void; insert(p: Position, t: string): void; delete(r: Range | Selection): void; setEndOfLine(): void }) => void): Promise<boolean> {
      const list: TextEdit[] = [];
      cb({
        replace: (r, t) => list.push(new TextEdit(r instanceof Position ? new Range(r, r) : r, t)),
        insert: (p, t) => list.push(TextEdit.insert(p, t)),
        delete: (r) => list.push(TextEdit.delete(r)),
        setEndOfLine: () => {},
      });
      return !!(await rpc.request<boolean>("ui/applyEdit", { files: [{ uri: this.document.uri.toString(), edits: jEdits(list) }] }));
    }
    async insertSnippet(snippet: { value: string }, location?: Position | Range) {
      const r = location instanceof Position ? new Range(location, location) : location;
      return !!(await rpc.request<boolean>("ui/insertSnippet", { uri: this.document.uri.toString(), snippet: snippet.value, range: r ? jRange(r) : null }));
    }
    setDecorations(type: { key: number }, ranges: (Range | { range: Range; hoverMessage?: unknown; renderOptions?: unknown })[]) {
      rpc.notify("ui/decorations", {
        type: type.key,
        uri: this.document.uri.toString(),
        items: ranges.map((r) => (r instanceof Range ? { range: jRange(r) } : { range: jRange(r.range), hover: r.hoverMessage ? String((r.hoverMessage as { value?: string }).value ?? r.hoverMessage) : undefined, render: r.renderOptions })),
      });
    }
    revealRange(range: Range, _type?: number) {
      rpc.notify("ui/reveal", { uri: this.document.uri.toString(), range: jRange(range) });
    }
    show() {}
    hide() {}
  }

  const editorFor = (doc: HostDocument): TextEditorImpl => {
    const k = doc.uri.toString();
    let e = editors.get(k);
    if (!e) editors.set(k, (e = new TextEditorImpl(doc, hc.activeEditor?.uri === k ? hc.activeEditor : undefined)));
    return e;
  };

  const channels = new Set<string>();
  const createOutputChannel = (name: string, opts?: string | { log?: boolean }) => {
    const id = `${ext?.id ?? "host"}:${name}`;
    channels.add(id);
    const send = (text: string, clear = false) => rpc.notify("ui/output", { channel: name, source: ext?.id, text, clear });
    const ch = {
      name,
      append: (v: string) => send(String(v)),
      appendLine: (v: string) => send(String(v) + "\n"),
      replace: (v: string) => send(String(v), true),
      clear: () => send("", true),
      show: (_c?: unknown, _preserve?: boolean) => rpc.notify("ui/outputShow", { channel: name }),
      hide: () => {},
      dispose: () => {},
    };
    if (opts && typeof opts === "object" && opts.log) {
      const lvl = (l: string) => (v: unknown, ...a: unknown[]) => send(`[${l}] ${[v, ...a].map((x) => (x instanceof Error ? x.stack ?? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" ")}\n`);
      return Object.assign(ch, { logLevel: 2, onDidChangeLogLevel: new EventEmitter<number>().event, trace: lvl("trace"), debug: lvl("debug"), info: lvl("info"), warn: lvl("warn"), error: lvl("error") });
    }
    return ch;
  };

  const statusItems = new Map<number, Record<string, unknown>>();
  const createStatusBarItem = (a?: string | StatusBarAlignment | { id?: string; alignment?: number; priority?: number }, b?: number | StatusBarAlignment, c?: number) => {
    const id = nextId();
    const isOpts = a && typeof a === "object";
    // Tiga bentuk: (alignment, priority) · (id, alignment, priority) · ({ id, alignment, priority }).
    const alignment = isOpts ? (a as { alignment?: number }).alignment : typeof a === "number" ? a : (b as number | undefined);
    const priority = isOpts ? (a as { priority?: number }).priority : typeof a === "number" ? (b as number | undefined) : c;
    const state: Record<string, unknown> = { id, owner: ext?.id, alignment: alignment ?? StatusBarAlignment.Left, priority: priority ?? 0, visible: false };
    statusItems.set(id, state);
    let pending = false;
    const push = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        rpc.notify("ui/statusItem", { ...state, command: typeof state.command === "string" ? state.command : (state.command as { command?: string } | undefined)?.command, args: (state.command as { arguments?: unknown[] } | undefined)?.arguments, color: state.color instanceof ThemeColor ? state.color.id : state.color, backgroundColor: state.backgroundColor instanceof ThemeColor ? state.backgroundColor.id : state.backgroundColor, tooltip: typeof state.tooltip === "string" ? state.tooltip : (state.tooltip as { value?: string } | undefined)?.value });
      });
    };
    const item = new Proxy(
      {
        id: typeof a === "string" ? a : undefined,
        alignment: state.alignment,
        priority: state.priority,
        show() {
          state.visible = true;
          push();
        },
        hide() {
          state.visible = false;
          push();
        },
        dispose() {
          rpc.notify("ui/statusItem", { id, removed: true });
          statusItems.delete(id);
        },
      } as Record<string, unknown>,
      {
        set(t, k: string, v) {
          t[k] = v;
          state[k] = v;
          push();
          return true;
        },
      }
    );
    return item;
  };

  const showQuickPick = async (items: unknown, options?: { canPickMany?: boolean; placeHolder?: string; matchOnDescription?: boolean; matchOnDetail?: boolean; title?: string }, token?: { isCancellationRequested: boolean }) => {
    const list = (await items) as (string | { label: string; description?: string; detail?: string; picked?: boolean; kind?: number })[];
    const wire = list.map((i) => (typeof i === "string" ? { label: i } : { label: i.label, description: i.description, detail: i.detail, picked: i.picked, separator: i.kind === -1 }));
    if (token?.isCancellationRequested) return undefined;
    const r = await rpc.request<number[] | null>("ui/quickPick", { items: wire, canPickMany: !!options?.canPickMany, placeHolder: options?.placeHolder, title: options?.title }, 0);
    if (!r) return undefined;
    const picked = r.map((i) => list[i]);
    return options?.canPickMany ? picked : picked[0];
  };

  const showInputBox = async (options?: { value?: string; prompt?: string; placeHolder?: string; password?: boolean; title?: string; validateInput?: (v: string) => string | undefined | null | Promise<string | undefined | null> }, _token?: unknown) => {
    let validate: string | null = null;
    for (;;) {
      const r: string | null | undefined = await rpc.request<string | null>("ui/inputBox", { value: options?.value, prompt: options?.prompt, placeHolder: options?.placeHolder, password: !!options?.password, title: options?.title, error: validate }, 0);
      if (r === null || r === undefined) return undefined;
      const raw: unknown = options?.validateInput ? await options.validateInput(r) : undefined;
      // InputBoxValidationMessage { message, severity }: hanya severity Error (3) yang menolak masukan.
      const err = raw && typeof raw === "object" ? ((raw as { severity?: number }).severity === 3 ? (raw as { message?: string }).message : undefined) : (raw as string | null | undefined);
      if (!err) return r;
      validate = String(err);
      options = { ...options, value: r };
    }
  };

  const withProgress = async <T>(opts: { location: number | { viewId: string }; title?: string; cancellable?: boolean }, task: (progress: { report(v: { message?: string; increment?: number }): void }, token: unknown) => Thenable<T> | T): Promise<T> => {
    const id = nextId();
    const cts = new CancellationTokenSource();
    rpc.notify("ui/progress", { id, title: opts.title, location: typeof opts.location === "number" ? opts.location : 1, cancellable: !!opts.cancellable });
    let total = 0;
    try {
      return await task({ report: (v) => {
        if (v.increment) total += v.increment;
        rpc.notify("ui/progress", { id, title: opts.title, message: v.message, percent: total || undefined });
      } }, cts.token);
    } finally {
      rpc.notify("ui/progress", { id, done: true });
    }
  };

  const decTypes = new Map<number, unknown>();
  const createTextEditorDecorationType = (options: Record<string, unknown>) => {
    const key = nextId();
    decTypes.set(key, options);
    rpc.notify("ui/decorationType", { key, options });
    return { key, dispose: () => { decTypes.delete(key); rpc.notify("ui/decorationType", { key, removed: true }); } };
  };

  /** Satu webview (panel di tab editor, atau tampilan di sidebar bila `viewId` diberikan). */
  const makeWebview = (viewType: string, title: string, showOptions: unknown, options: { localResourceRoots?: Uri[]; enableScripts?: boolean; retainContextWhenHidden?: boolean } = {}, viewId?: string) => {
      const id = nextId();
      const message = new EventEmitter<unknown>();
      const disposeEv = new EventEmitter<void>();
      const stateEv = new EventEmitter<{ webviewPanel: unknown }>();
      const roots = [ext?.dir, hc.root, ...(options.localResourceRoots ?? []).map((u) => u.fsPath)].filter((x): x is string => !!x);
      let html = "";
      let curTitle = title;
      let isDisposed = false;
      const column = typeof showOptions === "number" ? showOptions : (showOptions as { viewColumn?: number } | undefined)?.viewColumn ?? ViewColumn.Beside;
      rpc.notify("ui/webview", { op: "create", id, viewType, viewId, title, roots, owner: ext?.id, column, preserveFocus: !!(showOptions as { preserveFocus?: boolean } | undefined)?.preserveFocus });
      const panel: Record<string, unknown> = {
        __id: id,
        viewType,
        options,
        active: true,
        visible: true,
        viewColumn: column,
        onDidDispose: disposeEv.event,
        onDidChangeViewState: stateEv.event,
        get title() {
          return curTitle;
        },
        set title(t: string) {
          curTitle = t;
          rpc.notify("ui/webview", { op: "title", id, title: t });
        },
        iconPath: undefined,
        webview: {
          options,
          cspSource: "nozelweb:",
          get html() {
            return html;
          },
          set html(v: string) {
            html = v;
            rpc.notify("ui/webview", { op: "html", id, html: v });
          },
          onDidReceiveMessage: message.event,
          postMessage: async (m: unknown) => {
            if (isDisposed) return false;
            rpc.notify("ui/webview", { op: "post", id, message: m });
            return true;
          },
          // nozelweb://r/<id>/<path absolut tanpa "/" awal>; tiap segmen di-encode oleh Uri.toString().
          asWebviewUri: (u: Uri) => Uri.from({ scheme: "nozelweb", authority: ownerHost(ext?.id), path: `/r/${id}/${u.fsPath.replace(/\\/g, "/").replace(/^\//, "")}` }),
        },
        reveal: () => rpc.notify("ui/webview", { op: "reveal", id }),
        dispose: () => {
          if (isDisposed) return;
          isDisposed = true;
          hc.webviews.delete(id);
          rpc.notify("ui/webview", { op: "dispose", id });
          disposeEv.fire();
        },
      };
      hc.webviews.set(id, {
        message: (m) => message.fire(m),
        disposed: () => {
          if (isDisposed) return;
          isDisposed = true;
          hc.webviews.delete(id);
          disposeEv.fire();
        },
        state: (s) => {
          panel.active = s.active;
          panel.visible = s.visible;
          stateEv.fire({ webviewPanel: panel });
        },
      });
      return panel;
    };

  const terminals = new Map<number, { name: string }>();
  const createTerminal = (a?: string | { name?: string; shellPath?: string; shellArgs?: string[]; cwd?: string | Uri; env?: Record<string, string | null> }, shellPath?: string, shellArgs?: string[]) => {
    const o = typeof a === "object" ? a : { name: a, shellPath, shellArgs };
    const id = nextId();
    terminals.set(id, { name: o.name ?? "Terminal" });
    const created = rpc.request("ui/terminalCreate", { id, name: o.name, shellPath: o.shellPath, shellArgs: o.shellArgs, cwd: o.cwd instanceof Uri ? o.cwd.fsPath : o.cwd, env: o.env });
    void created.catch(() => {});
    return {
      name: o.name ?? "Terminal",
      processId: Promise.resolve(undefined),
      exitStatus: undefined,
      sendText: (text: string, addNewLine = true) => void created.then(() => rpc.notify("ui/terminalSend", { id, text, newline: addNewLine })),
      show: () => void created.then(() => rpc.notify("ui/terminalShow", { id })),
      hide: () => {},
      dispose: () => rpc.notify("ui/terminalDispose", { id }),
    };
  };

  const unsupported = (what: string) => () => {
    rpc.notify("ui/output", { channel: "Extension Host", text: `${prefix}${what} belum didukung di Alexel Studio.\n` });
    throw new Error(`${what} is not supported in Alexel Studio`);
  };

  const registerTreeDataProvider = (viewId: string, provider: { getChildren(e?: unknown): unknown; getTreeItem(e: unknown): unknown; onDidChangeTreeData?: (l: (e: unknown) => void) => { dispose(): void } }) => {
    hc.treeProviders.set(viewId, { provider, ext });
    const sub = provider.onDidChangeTreeData?.(() => rpc.notify("ui/treeChanged", { viewId }));
    rpc.notify("ui/treeRegistered", { viewId, owner: ext?.id });
    return new Disposable(() => {
      hc.treeProviders.delete(viewId);
      sub?.dispose();
      rpc.notify("ui/treeRegistered", { viewId, removed: true });
    });
  };

  return {
    showInformationMessage: message("info"),
    showWarningMessage: message("warn"),
    showErrorMessage: message("error"),
    showQuickPick,
    showInputBox,
    showWorkspaceFolderPick: async () => (hc.root ? { uri: Uri.file(hc.root), name: hc.root.split(/[\\/]/).pop() ?? "", index: 0 } : undefined),
    async showOpenDialog(o?: Record<string, unknown>) {
      const r = await rpc.request<string[] | null>("ui/openDialog", o ?? {}, 0);
      return r ? r.map((p) => Uri.file(p)) : undefined;
    },
    async showSaveDialog(o?: Record<string, unknown>) {
      const r = await rpc.request<string | null>("ui/saveDialog", o ?? {}, 0);
      return r ? Uri.file(r) : undefined;
    },
    createOutputChannel,
    createStatusBarItem,
    setStatusBarMessage(text: string, hideAfter?: number | Thenable<unknown>) {
      const item = createStatusBarItem(StatusBarAlignment.Left, -1000) as { text?: string; show(): void; dispose(): void };
      item.text = text;
      item.show();
      if (typeof hideAfter === "number") setTimeout(() => item.dispose(), hideAfter);
      else if (hideAfter) void Promise.resolve(hideAfter).finally(() => item.dispose());
      return new Disposable(() => item.dispose());
    },
    withProgress,
    get activeTextEditor() {
      const a = hc.activeEditor ? hc.docs.get(hc.activeEditor.uri) : undefined;
      return a ? editorFor(a) : undefined;
    },
    get visibleTextEditors() {
      return hc.activeEditor ? [this.activeTextEditor].filter(Boolean) : [];
    },
    onDidChangeActiveTextEditor: hc.events.activeEditor.event,
    onDidChangeVisibleTextEditors: new EventEmitter<unknown[]>().event,
    onDidChangeTextEditorSelection: hc.events.selection.event,
    onDidChangeTextEditorVisibleRanges: new EventEmitter<unknown>().event,
    onDidChangeTextEditorOptions: new EventEmitter<unknown>().event,
    async showTextDocument(arg: HostDocument | Uri, opts?: { selection?: Range; preview?: boolean; preserveFocus?: boolean; viewColumn?: number }) {
      const uri = arg instanceof Uri ? arg : arg.uri;
      await rpc.request("ui/showDocument", { uri: uri.toString(), selection: opts?.selection ? jRange(opts.selection) : null, preserveFocus: !!opts?.preserveFocus });
      const doc = hc.docs.get(uri.toString()) ?? (await (await import("./api-workspace")).workspaceApi(hc, ext).openTextDocument(uri));
      return editorFor(doc);
    },
    createTextEditorDecorationType,
    createTerminal,
    get terminals() {
      return [];
    },
    onDidOpenTerminal: new EventEmitter<unknown>().event,
    onDidCloseTerminal: new EventEmitter<unknown>().event,
    onDidChangeActiveTerminal: new EventEmitter<unknown>().event,
    registerTreeDataProvider,
    createTreeView: (viewId: string, o: { treeDataProvider: Parameters<typeof registerTreeDataProvider>[1] }) => {
      const d = registerTreeDataProvider(viewId, o.treeDataProvider);
      const base: Record<string, unknown> = { visible: true, selection: [], reveal: async () => rpc.notify("ui/revealView", { viewId }), dispose: () => d.dispose(), message: undefined, title: undefined, description: undefined, badge: undefined };
      // Semua on* (selection, visibility, expand, checkbox, …) adalah event kosong.
      return new Proxy(base, { get: (t, p: string) => (p in t ? t[p] : /^on[A-Z]/.test(p) ? new EventEmitter<unknown>().event : undefined), set: (t, p: string, v) => ((t[p] = v), true) });
    },
    createWebviewPanel: (viewType: string, title: string, showOptions: unknown, options: { localResourceRoots?: Uri[]; enableScripts?: boolean; retainContextWhenHidden?: boolean } = {}) => makeWebview(viewType, title, showOptions, options),
    registerWebviewViewProvider: (viewId: string, provider: { resolveWebviewView(view: unknown, ctx: unknown, token: unknown): unknown }, _options?: unknown) => {
      hc.webviewViews.set(viewId, { provider, ext, make: (title: string) => makeWebview(viewId, title, -1, {}, viewId) });
      rpc.notify("ui/webviewViewRegistered", { viewId, owner: ext?.id });
      return new Disposable(() => {
        hc.webviewViews.delete(viewId);
        rpc.notify("ui/webviewViewRegistered", { viewId, removed: true });
      });
    },
    registerWebviewPanelSerializer: () => new Disposable(() => {}),
    registerCustomEditorProvider: (viewType: string, provider: Record<string, unknown>, _options?: unknown) => {
      hc.customEditors.set(viewType, { provider, ext, make: (title: string, column: unknown) => makeWebview(viewType, title, column) });
      return new Disposable(() => hc.customEditors.delete(viewType));
    },
    registerFileDecorationProvider: () => new Disposable(() => {}),
    registerUriHandler: () => new Disposable(() => {}),
    registerTerminalLinkProvider: () => new Disposable(() => {}),
    registerTerminalProfileProvider: () => new Disposable(() => {}),
    createInputBox: unsupported("createInputBox"),
    createQuickPick: unsupported("createQuickPick"),
    state: { focused: true, active: true },
    onDidChangeWindowState: new EventEmitter<unknown>().event,
    // 1 = terang, 2 = gelap (ColorThemeKind); dikirim renderer sebagai pengaturan inti.
    get activeColorTheme() {
      return { kind: hc.core["workbench.colorThemeKind"] === 1 ? 1 : 2 };
    },
    onDidChangeActiveColorTheme: themeChanged(hc),
    activeNotebookEditor: undefined,
    visibleNotebookEditors: [],
    tabGroups: { all: [], activeTabGroup: { tabs: [] }, onDidChangeTabs: new EventEmitter<unknown>().event, onDidChangeTabGroups: new EventEmitter<unknown>().event },
    __editorFor: editorFor,
  };
}

const themeEmitters = new WeakMap<HostCtx, EventEmitter<unknown>>();
/** Satu emitter per host: dipicu bila jenis tema (terang/gelap) dari renderer berubah. */
function themeChanged(hc: HostCtx) {
  let em = themeEmitters.get(hc);
  if (!em) {
    const e = new EventEmitter<unknown>();
    em = e;
    themeEmitters.set(hc, e);
    hc.events.config.event((c: { affectsConfiguration(s: string): boolean }) => {
      if (c.affectsConfiguration("workbench.colorThemeKind")) e.fire({ kind: hc.core["workbench.colorThemeKind"] === 1 ? 1 : 2 });
    });
  }
  return em.event;
}

