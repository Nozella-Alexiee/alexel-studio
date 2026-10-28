// vscode.workspace: dokumen, konfigurasi, berkas (langsung lewat fs Node), edit, watcher.

import fs from "node:fs";
import path from "node:path";
import { HostDocument } from "./document";
import { globMatch } from "./glob";
import type { HostCtx, LoadedExt } from "./context";
import { edits as jEdits } from "./convert";
import { Disposable, EventEmitter, FileSystemError, FileType, Position, Range, RelativePattern, TextEdit, WorkspaceEdit } from "./types";
import { Uri } from "./uri";

/** `p` ada di dalam (atau sama dengan) folder `dir`; "/proj" tidak cocok dengan "/proj2". */
const within = (dir: string, p: string) => p === dir || p.startsWith(dir.replace(/[\\/]+$/, "") + path.sep);

let untitledSeq = 0;
const deepClone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function configurationApi(hc: HostCtx, _ext: LoadedExt | null) {
  const keysUnder = (prefix: string): string[] => {
    const all = new Set<string>([...hc.defaults.keys(), ...Object.keys(hc.core), ...Object.keys(hc.settings)]);
    return [...all].filter((k) => k === prefix || k.startsWith(prefix + "."));
  };
  const lookup = (key: string): unknown => (key in hc.settings ? hc.settings[key] : key in hc.core ? hc.core[key] : hc.defaults.get(key));

  const get = (section: string | undefined, key: string): unknown => {
    const full = section ? `${section}.${key}` : key;
    const direct = lookup(full);
    if (direct !== undefined) return deepClone(direct);
    // Objek bersarang dari kunci datar: get("a") saat ada a.b dan a.c.
    const children = keysUnder(full).filter((k) => k !== full);
    if (!children.length) return undefined;
    const out: Record<string, unknown> = {};
    for (const k of children) {
      const parts = k.slice(full.length + 1).split(".");
      let cur = out;
      parts.forEach((p, i) => {
        if (i === parts.length - 1) cur[p] = deepClone(lookup(k));
        else cur = (cur[p] = (cur[p] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      });
    }
    return out;
  };

  return (section?: string, _scope?: unknown) => {
    const cfg = {
      get<T>(key: string, def?: T): T | undefined {
        const v = get(section, key);
        return (v === undefined ? def : v) as T | undefined;
      },
      has(key: string) {
        return get(section, key) !== undefined;
      },
      inspect<T>(key: string) {
        const full = section ? `${section}.${key}` : key;
        return { key: full, defaultValue: hc.defaults.get(full) as T | undefined, globalValue: hc.settings[full] as T | undefined, workspaceValue: undefined, workspaceFolderValue: undefined };
      },
      async update(key: string, value: unknown, _target?: unknown) {
        const full = section ? `${section}.${key}` : key;
        if (value === undefined) delete hc.settings[full];
        else hc.settings[full] = value;
        void hc.rpc.request("ui/configUpdate", { key: full, value: value === undefined ? null : value }).catch(() => {});
        hc.events.config.fire({ affectsConfiguration: (s: string) => full === s || full.startsWith(s + ".") || s.startsWith(full + ".") });
      },
    };
    // Akses properti langsung (config.someKey) seperti objek konfigurasi VS Code.
    return new Proxy(cfg, { get: (t, p: string) => (p in t ? (t as Record<string, unknown>)[p] : typeof p === "string" ? get(section, p) : undefined) });
  };
}

function readDocFromDisk(hc: HostCtx, uri: Uri): HostDocument {
  const text = fs.readFileSync(uri.fsPath, "utf8");
  const doc = new HostDocument(uri, languageFromPath(uri.fsPath), 1, text, text.includes("\r\n") ? 2 : 1);
  hc.docs.set(uri.toString(), doc);
  return doc;
}

const EXT_LANG: Record<string, string> = { ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact", json: "json", md: "markdown", py: "python", css: "css", scss: "scss", html: "html", yaml: "yaml", yml: "yaml", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp", sh: "shellscript", php: "php", rb: "ruby", sql: "sql", xml: "xml", txt: "plaintext" };
export const languageFromPath = (p: string) => EXT_LANG[path.extname(p).slice(1).toLowerCase()] ?? "plaintext";

const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/.git/**", "**/.DS_Store"];

function walk(root: string, include: string, exclude: string[], max: number, cancelled: () => boolean): Uri[] {
  const out: Uri[] = [];
  const rec = (dir: string, rel: string) => {
    if (out.length >= max || cancelled()) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (exclude.some((g) => globMatch(g, r) || (e.isDirectory() && globMatch(g, r + "/x")))) continue;
      if (e.isDirectory()) rec(path.join(dir, e.name), r);
      else if (e.isFile() && globMatch(include, r)) out.push(Uri.file(path.join(dir, e.name)));
    }
  };
  rec(root, "");
  return out;
}

export function workspaceApi(hc: HostCtx, ext: LoadedExt | null) {
  const folders = () => (hc.root ? [hc.root, ...hc.extraFolders].map((f, index) => ({ uri: Uri.file(f), name: path.basename(f), index })) : undefined);
  const toStat = (st: fs.Stats) => ({ type: st.isDirectory() ? FileType.Directory : st.isSymbolicLink() ? FileType.SymbolicLink : FileType.File, ctime: st.ctimeMs, mtime: st.mtimeMs, size: st.size });
  const wrapFs = async <T>(uri: Uri, fn: () => T): Promise<T> => {
    try {
      return fn();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw FileSystemError.FileNotFound(uri);
      if (code === "EEXIST") throw FileSystemError.FileExists(uri);
      if (code === "EACCES" || code === "EPERM") throw FileSystemError.NoPermissions(uri);
      if (code === "ENOTDIR") throw FileSystemError.FileNotADirectory(uri);
      if (code === "EISDIR") throw FileSystemError.FileIsADirectory(uri);
      throw e;
    }
  };

  const fsApi = {
    stat: (u: Uri) => wrapFs(u, () => toStat(fs.statSync(u.fsPath))),
    readFile: (u: Uri) => wrapFs(u, () => new Uint8Array(fs.readFileSync(u.fsPath))),
    writeFile: (u: Uri, content: Uint8Array) =>
      wrapFs(u, () => {
        fs.mkdirSync(path.dirname(u.fsPath), { recursive: true });
        fs.writeFileSync(u.fsPath, content);
      }),
    readDirectory: (u: Uri) => wrapFs(u, () => fs.readdirSync(u.fsPath, { withFileTypes: true }).map((d) => [d.name, d.isDirectory() ? FileType.Directory : d.isSymbolicLink() ? FileType.SymbolicLink : FileType.File] as [string, FileType])),
    createDirectory: (u: Uri) => wrapFs(u, () => void fs.mkdirSync(u.fsPath, { recursive: true })),
    delete: (u: Uri, o?: { recursive?: boolean; useTrash?: boolean }) => wrapFs(u, () => fs.rmSync(u.fsPath, { recursive: !!o?.recursive, force: false })),
    rename: (a: Uri, b: Uri, o?: { overwrite?: boolean }) =>
      wrapFs(a, () => {
        if (!o?.overwrite && fs.existsSync(b.fsPath)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
        fs.renameSync(a.fsPath, b.fsPath);
      }),
    copy: (a: Uri, b: Uri, o?: { overwrite?: boolean }) =>
      wrapFs(a, () => {
        if (!o?.overwrite && fs.existsSync(b.fsPath)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
        fs.cpSync(a.fsPath, b.fsPath, { recursive: true });
      }),
    isWritableFileSystem: () => true,
  };

  return {
    get workspaceFolders() {
      return folders();
    },
    get name() {
      return hc.root ? path.basename(hc.root) : undefined;
    },
    get rootPath() {
      return hc.root ?? undefined;
    },
    workspaceFile: undefined,
    isTrusted: true,
    get textDocuments() {
      return [...hc.docs.values()].filter((d) => !d.isClosed && d.isOpenInEditor);
    },
    notebookDocuments: [],
    fs: fsApi,
    getConfiguration: configurationApi(hc, ext),
    onDidChangeConfiguration: hc.events.config.event,
    onDidOpenTextDocument: hc.events.openDoc.event,
    onDidCloseTextDocument: hc.events.closeDoc.event,
    onDidChangeTextDocument: hc.events.changeDoc.event,
    onDidSaveTextDocument: hc.events.saveDoc.event,
    onWillSaveTextDocument: new EventEmitter<unknown>().event,
    onDidChangeWorkspaceFolders: hc.events.folders.event,
    onDidGrantWorkspaceTrust: new EventEmitter<void>().event,
    onDidCreateFiles: new EventEmitter<unknown>().event,
    onDidDeleteFiles: new EventEmitter<unknown>().event,
    onDidRenameFiles: new EventEmitter<unknown>().event,
    onWillCreateFiles: new EventEmitter<unknown>().event,
    onWillDeleteFiles: new EventEmitter<unknown>().event,
    onWillRenameFiles: new EventEmitter<unknown>().event,
    getWorkspaceFolder: (uri: Uri) => folders()?.find((f) => within(f.uri.fsPath, uri.fsPath)),
    asRelativePath(p: string | Uri, includeFolder?: boolean) {
      const fsPath = typeof p === "string" ? p : p.fsPath;
      const all = hc.root ? [hc.root, ...hc.extraFolders] : [];
      const base = all.find((f) => within(f, fsPath));
      if (!base) return fsPath;
      const rel = path.relative(base, fsPath).replace(/\\/g, "/");
      // Seperti VS Code: nama folder disertakan bawaan bila workspace punya lebih dari satu folder.
      return includeFolder ?? all.length > 1 ? `${path.basename(base)}/${rel}` : rel;
    },
    async openTextDocument(arg?: Uri | string | { language?: string; content?: string }) {
      if (arg && typeof arg === "object" && !(arg instanceof Uri) && ("content" in arg || "language" in arg)) {
        const o = arg as { language?: string; content?: string };
        const uri = Uri.from({ scheme: "untitled", path: `Untitled-${++untitledSeq}` });
        const doc = new HostDocument(uri, o.language ?? "plaintext", 1, o.content ?? "");
        hc.docs.set(uri.toString(), doc);
        return doc;
      }
      const uri = typeof arg === "string" ? Uri.file(arg) : (arg as Uri);
      const open = hc.docs.get(uri.toString());
      if (open && !open.isClosed) return open;
      return readDocFromDisk(hc, uri);
    },
    async applyEdit(edit: WorkspaceEdit): Promise<boolean> {
      // Operasi berkas (buat/hapus/ganti nama) dijalankan langsung di host; gagal = seluruh edit dianggap gagal.
      for (const o of edit.fileOps) {
        try {
          if (o.op === "create") {
            if (fs.existsSync(o.uri.fsPath)) {
              if (o.ignoreIfExists) continue;
              if (!o.overwrite) return false;
            }
            fs.mkdirSync(path.dirname(o.uri.fsPath), { recursive: true });
            fs.writeFileSync(o.uri.fsPath, "");
          } else if (o.op === "delete") fs.rmSync(o.uri.fsPath, { recursive: !!o.recursive, force: false });
          else if (o.op === "rename" && o.to) {
            if (fs.existsSync(o.to.fsPath) && !o.overwrite) {
              if (o.ignoreIfExists) continue;
              return false;
            }
            fs.mkdirSync(path.dirname(o.to.fsPath), { recursive: true });
            fs.renameSync(o.uri.fsPath, o.to.fsPath);
          }
        } catch {
          return false;
        }
      }
      const files = edit.entries().map(([u, e]) => ({ uri: u.toString(), edits: jEdits(e) }));
      return !!(await hc.rpc.request<boolean>("ui/applyEdit", { files }));
    },
    async saveAll() {
      await hc.rpc.request("ui/saveAll").catch(() => {});
      return true;
    },
    async findFiles(include: string | RelativePattern, exclude?: string | RelativePattern | null, maxResults = 20_000, token?: { isCancellationRequested: boolean }) {
      const bases = include instanceof RelativePattern ? [include.baseUri.fsPath] : hc.root ? [hc.root, ...hc.extraFolders] : [];
      if (!bases.length) return [];
      const inc = include instanceof RelativePattern ? include.pattern : include;
      const exc = exclude === null ? [] : exclude === undefined ? DEFAULT_EXCLUDE : [exclude instanceof RelativePattern ? exclude.pattern : exclude];
      const out: Uri[] = [];
      for (const base of bases) out.push(...(await walk(base, inc, exc, maxResults - out.length, () => !!token?.isCancellationRequested)));
      return out;
    },
    createFileSystemWatcher(glob: string | RelativePattern, ignoreCreate?: boolean, ignoreChange?: boolean, ignoreDelete?: boolean) {
      const create = new EventEmitter<Uri>();
      const change = new EventEmitter<Uri>();
      const del = new EventEmitter<Uri>();
      const matches = (u: Uri) => {
        if (glob instanceof RelativePattern) return u.fsPath.startsWith(glob.baseUri.fsPath) && globMatch(glob.pattern, path.relative(glob.baseUri.fsPath, u.fsPath));
        const rel = hc.root && u.fsPath.startsWith(hc.root) ? path.relative(hc.root, u.fsPath) : u.fsPath;
        return globMatch(glob, rel);
      };
      const sub = hc.events.fsChanged.event((e) => {
        if (!matches(e.uri)) return;
        if (e.kind === "create" && !ignoreCreate) create.fire(e.uri);
        else if (e.kind === "change" && !ignoreChange) change.fire(e.uri);
        else if (e.kind === "delete" && !ignoreDelete) del.fire(e.uri);
      });
      return Object.assign(Disposable.from({ dispose: () => sub.dispose() }), {
        ignoreCreateEvents: !!ignoreCreate,
        ignoreChangeEvents: !!ignoreChange,
        ignoreDeleteEvents: !!ignoreDelete,
        onDidCreate: create.event,
        onDidChange: change.event,
        onDidDelete: del.event,
      });
    },
    registerTextDocumentContentProvider(_scheme: string, _p: unknown) {
      return new Disposable(() => {});
    },
    registerFileSystemProvider() {
      return new Disposable(() => {});
    },
    registerTaskProvider() {
      return new Disposable(() => {});
    },
    updateWorkspaceFolders() {
      return false;
    },
    openNotebookDocument: async () => {
      throw new Error("Notebooks are not supported");
    },
    textEditsFrom: (list: TextEdit[]) => list,
  };
}

export { Position, Range };
