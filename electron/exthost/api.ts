// Objek `vscode` per ekstensi: menggabungkan namespace + kelas. Yang belum ada tidak membuat ekstensi
// crash saat aktivasi: dicatat sekali ke Output, lalu mengembalikan fungsi kosong.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { languagesApi } from "./api-languages";
import { windowApi } from "./api-window";
import { workspaceApi } from "./api-workspace";
import type { HostCtx, LoadedExt } from "./context";
import { Memento } from "./memento";
import { createTestController } from "./tests";
import { tasksApi } from "./tasks";
import * as T from "./types";
import { Uri } from "./uri";

export const VSCODE_VERSION = "1.106.0";

function commandsApi(hc: HostCtx, ext: LoadedExt | null) {
  const set = (id: string, fn: (...a: unknown[]) => unknown, thisArg?: unknown, editor = false) => {
    if (hc.commands.has(id)) throw new Error(`command '${id}' already exists`);
    hc.commands.set(id, { fn, thisArg, ext, editor });
    hc.rpc.notify("ui/commandRegistered", { id, owner: ext?.id });
    return new T.Disposable(() => {
      if (hc.commands.get(id)?.fn === fn) hc.commands.delete(id);
    });
  };
  return {
    registerCommand: (id: string, fn: (...a: unknown[]) => unknown, thisArg?: unknown) => set(id, fn, thisArg),
    registerTextEditorCommand: (id: string, fn: (...a: unknown[]) => unknown, thisArg?: unknown) => set(id, fn, thisArg, true),
    async executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R> {
      return runCommand(hc, id, args) as Promise<R>;
    },
    async getCommands(filterInternal?: boolean) {
      const own = [...hc.commands.keys()];
      return filterInternal ? own.filter((c) => !c.startsWith("_")) : own;
    },
  };
}

/** Jalankan perintah: milik ekstensi (aktifkan dulu bila perlu) atau bawaan editor (diteruskan ke UI). */
export async function runCommand(hc: HostCtx, id: string, args: unknown[]): Promise<unknown> {
  if (!hc.commands.has(id)) await hc.activateByEvent(`onCommand:${id}`);
  const c = hc.commands.get(id);
  if (c) {
    if (c.editor) {
      const win = buildApi(hc, null).window as { activeTextEditor?: { edit(cb: (b: unknown) => void): Promise<boolean> } };
      const ed = win.activeTextEditor;
      if (!ed) return undefined; // seperti VS Code: tanpa editor aktif, perintah editor tidak berjalan
      let result: unknown;
      // Pembangun edit sungguhan (replace/insert/delete) diterapkan setelah fungsi ekstensi selesai.
      await ed.edit((b) => {
        result = c.fn.call(c.thisArg, ed, b, ...args);
      });
      return result;
    }
    return c.fn.apply(c.thisArg, args);
  }
  // VS Code mendaftarkan `<idTampilan>.focus` untuk setiap tampilan: buka sidebar tampilan ekstensi.
  if (id.endsWith(".focus") && (hc.treeProviders.has(id.slice(0, -6)) || [...hc.extensions.values()].some((e) => JSON.stringify(e.manifest.contributes?.views ?? {}).includes(`"${id.slice(0, -6)}"`)))) {
    hc.rpc.notify("ui/revealView", { viewId: id.slice(0, -6) });
    return undefined;
  }
  if (id === "vscode.openWith") {
    const editor = hc.customEditors.get(String(args[1]));
    if (editor) {
      const uri = Uri.revive(args[0]);
      const opts = (args[2] ?? {}) as { viewColumn?: number };
      const doc = editor.provider.openCustomDocument ? await editor.provider.openCustomDocument(uri, { backupId: undefined }, T.CancellationToken.None) : { uri, dispose() {} };
      const panel = editor.make(uri.path.split("/").pop() || String(args[1]), opts.viewColumn ?? T.ViewColumn.Active);
      if (editor.provider.resolveCustomEditor) await editor.provider.resolveCustomEditor(doc, panel, T.CancellationToken.None);
      else if (editor.provider.resolveCustomTextEditor) await editor.provider.resolveCustomTextEditor(await (buildApi(hc, editor.ext).workspace as { openTextDocument(u: Uri): Promise<unknown> }).openTextDocument(uri), panel, T.CancellationToken.None);
      return undefined;
    }
  }
  if (id === "setContext") {
    hc.rpc.notify("ui/setContext", { key: args[0], value: args[1] });
    return undefined;
  }
  return hc.rpc.request("ui/executeCommand", { command: id, args: args.map((a) => (a instanceof Uri ? { $uri: a.toString() } : a)) });
}

/**
 * Beberapa ekstensi (Todo Tree, pencarian) mencari ripgrep di `appRoot/node_modules/@vscode/ripgrep/bin/rg`.
 * Alexel Studio membundel ripgrep (NOZEL_RIPGREP); bila tidak ada, dipakai `rg` di PATH. Tautan dibuat di folder palsu ini.
 */
export function appRoot(hc: Pick<HostCtx, "userData">): string {
  const root = path.join(hc.userData, "exthost", "app");
  try {
    const found = process.env.NOZEL_RIPGREP || findInPath(process.platform === "win32" ? "rg.exe" : "rg");
    if (found) {
      for (const base of ["node_modules", "node_modules.asar.unpacked"]) {
        const dir = path.join(root, base, "@vscode", "ripgrep", "bin");
        const link = path.join(dir, path.basename(found));
        fs.mkdirSync(dir, { recursive: true });
        try {
          fs.rmSync(link, { force: true });
          fs.symlinkSync(found, link);
        } catch {
          fs.copyFileSync(found, link);
        }
      }
    }
  } catch {
    /* tanpa ripgrep */
  }
  return root;
}

function findInPath(name: string): string | null {
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(d, name);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* lanjut */
    }
  }
  return null;
}

function envApi(hc: HostCtx) {
  return {
    appName: "Alexel Studio",
    appRoot: appRoot(hc),
    appHost: "desktop",
    uriScheme: "alexel",
    language: "en",
    machineId: "alexel-" + os.hostname().replace(/\W/g, "").slice(0, 12),
    sessionId: String(process.pid),
    isNewAppInstall: false,
    isTelemetryEnabled: false,
    onDidChangeTelemetryEnabled: new T.EventEmitter<boolean>().event,
    remoteName: undefined,
    shell: process.env.SHELL ?? (process.platform === "win32" ? "powershell.exe" : "/bin/sh"),
    uiKind: T.UIKind.Desktop,
    logLevel: 2,
    onDidChangeLogLevel: new T.EventEmitter<number>().event,
    clipboard: {
      readText: () => hc.rpc.request<string>("ui/clipboardRead"),
      writeText: (t: string) => hc.rpc.request<void>("ui/clipboardWrite", { text: t }),
    },
    openExternal: async (uri: Uri) => !!(await hc.rpc.request("ui/openExternal", { url: uri.toString() })),
    asExternalUri: async (uri: Uri) => uri,
    createTelemetryLogger: () => ({ logUsage() {}, logError() {}, dispose() {}, onDidChangeEnableStates: new T.EventEmitter<unknown>().event, isUsageEnabled: false, isErrorsEnabled: false }),
  };
}

function extensionsApi(hc: HostCtx) {
  const wrap = (e: LoadedExt) => ({
    id: e.id,
    extensionUri: Uri.file(e.dir),
    extensionPath: e.dir,
    get isActive() {
      return e.active;
    },
    packageJSON: e.manifest,
    extensionKind: 1,
    get exports() {
      return e.exports;
    },
    activate: async () => {
      await hc.activate(e.id, "api");
      return e.exports;
    },
  });
  return {
    getExtension: (id: string) => {
      const e = [...hc.extensions.values()].find((x) => x.id.toLowerCase() === id.toLowerCase());
      return e ? wrap(e) : undefined;
    },
    get all() {
      return [...hc.extensions.values()].map(wrap);
    },
    onDidChange: new T.EventEmitter<void>().event,
  };
}

/** Controller pengujian tanpa UI: koleksi item sungguhan, run profile dan run kosong. */
const warned = new Set<string>();
/** Namespace yang belum diimplementasikan: setiap anggota fungsi kosong; peringatan dicatat sekali. */
function lenient<O extends object>(hc: HostCtx, ext: LoadedExt | null, name: string, impl: O): O {
  return new Proxy(impl, {
    get(t, p: string | symbol) {
      if (p in t || typeof p === "symbol") return (t as Record<string | symbol, unknown>)[p];
      if (/^on[A-Z]/.test(p)) return new T.EventEmitter<unknown>().event;
      const key = `${name}.${p}`;
      return (..._a: unknown[]) => {
        if (!warned.has(key)) {
          warned.add(key);
          hc.log(ext, `vscode.${key} belum didukung (diabaikan)`);
        }
        return new T.Disposable(() => {});
      };
    },
  });
}

const apis = new Map<string, Record<string, unknown>>();

export function buildApi(hc: HostCtx, ext: LoadedExt | null): Record<string, unknown> {
  const key = ext?.id ?? "<host>";
  const cached = apis.get(key);
  if (cached) return cached;
  const api: Record<string, unknown> = {
    version: VSCODE_VERSION,
    ...T,
    Uri,
    commands: commandsApi(hc, ext),
    window: lenient(hc, ext, "window", windowApi(hc, ext)),
    workspace: lenient(hc, ext, "workspace", workspaceApi(hc, ext)),
    languages: lenient(hc, ext, "languages", languagesApi(hc, ext)),
    env: envApi(hc),
    extensions: extensionsApi(hc),
    tasks: lenient(hc, ext, "tasks", tasksApi(hc, ext)),
    debug: lenient(hc, ext, "debug", { breakpoints: [], activeDebugSession: undefined, registerDebugConfigurationProvider: () => new T.Disposable(() => {}), registerDebugAdapterDescriptorFactory: () => new T.Disposable(() => {}), registerDebugAdapterTrackerFactory: () => new T.Disposable(() => {}) }),
    scm: lenient(hc, ext, "scm", {}),
    authentication: lenient(hc, ext, "authentication", { getSession: async () => undefined, registerAuthenticationProvider: () => new T.Disposable(() => {}) }),
    comments: lenient(hc, ext, "comments", {}),
    notebooks: lenient(hc, ext, "notebooks", {}),
    tests: lenient(hc, ext, "tests", { createTestController: (id: string, label: string) => createTestController(hc, id, label) }),
    chat: lenient(hc, ext, "chat", {}),
    lm: lenient(hc, ext, "lm", { tools: [], selectChatModels: async () => [] }),
    l10n: { t: (m: string | { message: string }, ...a: unknown[]) => String(typeof m === "string" ? m : m.message).replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? "")), bundle: undefined, uri: undefined },
  };
  const out = new Proxy(api, {
    get: (t, p: string | symbol) => {
      if (typeof p === "symbol" || p in t) return (t as Record<string | symbol, unknown>)[p];
      // Anggota yang tidak ada: dicatat sekali supaya celah API mudah ditemukan (lihat Output → Extension Host).
      const k = `<top>.${p}`;
      if (!warned.has(k) && p !== "then" && p !== "default" && p !== "__esModule") {
        warned.add(k);
        hc.log(ext, `vscode.${p} tidak ada`);
      }
      return undefined;
    },
  });
  apis.set(key, out);
  return out;
}

/** ExtensionContext untuk `activate(context)`. */
export function buildContext(hc: HostCtx, ext: LoadedExt): Record<string, unknown> {
  const base = path.join(hc.userData, "exthost", ext.id);
  // Hash seluruh path project: memotong base64 cuma memakai 18 byte pertama (project saudara berbagi state).
  const wsKey = createHash("sha1").update(hc.root ?? "none").digest("hex").slice(0, 16);
  // Folder induk harus ada: ekstensi sering memanggil mkdir (tidak rekursif) pada globalStoragePath.
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch {
    /* diabaikan */
  }
  const globalState = new Memento(path.join(base, "global.json"));
  const workspaceState = new Memento(path.join(base, `ws-${wsKey}.json`));
  ext.mementos = [globalState, workspaceState];
  const secrets = new Map<string, string>();
  const secretEmitter = new T.EventEmitter<{ key: string }>();
  return {
    subscriptions: ext.subscriptions,
    extensionPath: ext.dir,
    extensionUri: Uri.file(ext.dir),
    storagePath: path.join(base, "ws"),
    globalStoragePath: path.join(base, "global"),
    storageUri: Uri.file(path.join(base, "ws")),
    globalStorageUri: Uri.file(path.join(base, "global")),
    logPath: path.join(base, "log"),
    logUri: Uri.file(path.join(base, "log")),
    extensionMode: T.ExtensionMode.Production,
    environmentVariableCollection: { persistent: true, description: undefined, replace() {}, append() {}, prepend() {}, get: () => undefined, forEach() {}, delete() {}, clear() {}, getScoped: () => ({}) },
    asAbsolutePath: (rel: string) => path.join(ext.dir, rel),
    globalState,
    workspaceState,
    secrets: {
      get: async (k: string) => secrets.get(k),
      store: async (k: string, v: string) => void (secrets.set(k, v), secretEmitter.fire({ key: k })),
      delete: async (k: string) => void (secrets.delete(k), secretEmitter.fire({ key: k })),
      onDidChange: secretEmitter.event,
    },
    extension: { id: ext.id, extensionPath: ext.dir, packageJSON: ext.manifest },
    languageModelAccessInformation: { onDidChange: new T.EventEmitter<void>().event, canSendRequest: () => undefined },
  };
}
