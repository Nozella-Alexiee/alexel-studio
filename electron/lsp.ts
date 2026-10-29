// Language server (LSP) untuk autocomplete, hover, go-to-definition, rename, dan diagnostik asli.
// Server dijalankan per (folder project, bahasa). Pesan JSON-RPC dibingkai Content-Length di sini;
// renderer hanya menerima/mengirim JSON mentah lewat event `lsp-message` dan command `lsp_send`.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { managedById, managedInstalled, MANAGED } from "./managedServers";
import { childEnv, findExecutable, killTree, spawnable, type Ctx } from "./util";

export interface ServerDef {
  id: string;
  name: string;
  /** Bahasa (id dari src/editor/languages.ts) yang dilayani. */
  langs: string[];
  /** Perintah dari PATH (kalau tidak dibundel). */
  bin?: string;
  args?: string[];
  bundled?: boolean;
  install?: string;
}

export const SERVERS: ServerDef[] = [
  { id: "typescript", name: "TypeScript & JavaScript", langs: ["ts", "js"], bundled: true },
  { id: "python", name: "Python (Pyright)", langs: ["py"], bin: "pyright-langserver", args: ["--stdio"], install: "npm install -g pyright" },
  { id: "php", name: "PHP (Intelephense)", langs: ["php"], bin: "intelephense", args: ["--stdio"], install: "npm install -g intelephense" },
  { id: "rust", name: "Rust (rust-analyzer)", langs: ["rs"], bin: "rust-analyzer", args: [], install: "rustup component add rust-analyzer" },
  { id: "go", name: "Go (gopls)", langs: ["go"], bin: "gopls", args: [], install: "go install golang.org/x/tools/gopls@latest" },
  { id: "c", name: "C/C++ (clangd)", langs: ["c", "cpp"], bin: "clangd", args: [], install: process.platform === "darwin" ? "xcode-select --install" : process.platform === "win32" ? "winget install LLVM.LLVM" : "sudo apt install clangd (atau dnf/pacman)" },
  { id: "css", name: "CSS/HTML/JSON", langs: ["css"], bin: "vscode-css-language-server", args: ["--stdio"], install: "npm install -g vscode-langservers-extracted" },
];

const whichBin = (bin: string) => findExecutable(bin);

/** Path modul yang dibundel; di aplikasi terpaket, modul ada di app.asar.unpacked. */
function bundledPath(rel: string): string {
  return require.resolve(rel).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

export function serverStatus(ctx: Ctx) {
  const own = SERVERS.map((s) => ({ id: s.id, name: s.name, langs: s.langs, available: s.bundled ? true : !!(s.bin && whichBin(s.bin)), bundled: !!s.bundled, install: s.install ?? null, managed: false, version: null as string | null, extensionIds: [] as string[] }));
  // Server terkurasi sekali klik: tersedia bila sudah dipasang dari aplikasi ini.
  const managed = MANAGED.map((m) => ({ id: m.id, name: m.name, langs: m.langs, available: !!managedInstalled(ctx, m), bundled: false, install: null, managed: true, version: m.vsix.version, extensionIds: m.extensionIds }));
  return [...own, ...managed];
}

interface Running {
  key: string;
  proc: ChildProcess;
  buf: Buffer;
}
const running = new Map<string, Running>();

/** Pecah stream stdout menjadi pesan JSON berdasarkan header Content-Length. */
export function parseFrames(buf: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = [];
  let b = buf;
  for (;;) {
    const sep = b.indexOf("\r\n\r\n");
    if (sep < 0) break;
    const header = b.subarray(0, sep).toString("ascii");
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) {
      b = b.subarray(sep + 4);
      continue;
    }
    const len = Number(m[1]);
    if (b.length < sep + 4 + len) break;
    messages.push(b.subarray(sep + 4, sep + 4 + len).toString("utf8"));
    b = b.subarray(sep + 4 + len);
  }
  return { messages, rest: b };
}

export const frame = (json: string) => `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;

export function lspStart(ctx: Ctx, serverId: string, root: string): { key: string; initializationOptions: unknown; settings: Record<string, unknown> | null } {
  const managed = managedById(serverId);
  const def = SERVERS.find((s) => s.id === serverId);
  if (!def && !managed) throw new Error(`Server bahasa tidak dikenal: ${serverId}`);
  const settings = managed?.settings ?? null;
  const key = `${serverId}::${root}`;
  let initializationOptions: unknown = undefined;
  if (managed) initializationOptions = managed.init?.(managedInstalled(ctx, managed)?.dir ?? "");
  if (def?.bundled) initializationOptions = { tsserver: { fallbackPath: bundledPath("bundled-typescript/lib/tsserver.js") }, preferences: { includeCompletionsForModuleExports: true, includeCompletionsWithInsertText: true } };
  if (running.has(key)) return { key, initializationOptions, settings };

  let cmd: string;
  let args: string[];
  let env = childEnv();
  if (managed) {
    const inst = managedInstalled(ctx, managed);
    if (!inst) throw new Error(`${managed.name} belum dipasang.`);
    cmd = process.execPath;
    args = [inst.entry, ...managed.args];
    env = childEnv({ ELECTRON_RUN_AS_NODE: "1" });
  } else if (def!.bundled) {
    // Jalankan dengan Node bawaan Electron supaya tidak bergantung Node milik pengguna.
    cmd = process.execPath;
    args = [bundledPath("typescript-language-server/lib/cli.mjs"), "--stdio"];
    env = childEnv({ ELECTRON_RUN_AS_NODE: "1" });
  } else {
    const p = def!.bin ? whichBin(def!.bin) : null;
    if (!p) throw new Error(`${def!.name} belum terpasang. Pasang dengan: ${def!.install}`);
    cmd = p;
    args = def!.args ?? [];
  }
  const sp = spawnable(cmd, args);
  const proc = spawn(sp.cmd, sp.args, { cwd: fs.existsSync(root) ? root : undefined, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
  proc.stdin?.on("error", () => {}); // server mati di tengah tulis: EPIPE jangan sampai crash main
  const r: Running = { key, proc, buf: Buffer.alloc(0) };
  running.set(key, r);
  proc.stdout?.on("data", (chunk: Buffer) => {
    const { messages, rest } = parseFrames(Buffer.concat([r.buf, chunk]));
    r.buf = rest;
    for (const message of messages) ctx.emit("lsp-message", { key, message });
  });
  // Log server diteruskan ke panel Output (dibatasi supaya server yang cerewet tidak membanjiri UI).
  let logBudget = 200_000;
  proc.stderr?.on("data", (b: Buffer) => {
    if (logBudget <= 0) return;
    const text = b.toString("utf8").slice(0, 4000);
    logBudget -= text.length;
    ctx.emit("lsp-log", { key, text });
  });
  const gone = (code: number | null) => {
    if (running.get(key) === r) running.delete(key);
    ctx.emit("lsp-exit", { key, code });
  };
  proc.on("exit", gone);
  proc.on("error", () => gone(null));
  return { key, initializationOptions, settings };
}

export function lspSend(key: string, message: string) {
  const r = running.get(key);
  if (!r?.proc.stdin?.writable) throw new Error("Server bahasa tidak berjalan.");
  r.proc.stdin.write(frame(message));
}

export function lspStop(key: string) {
  const r = running.get(key);
  if (!r) return;
  running.delete(key);
  killTree(r.proc);
}

export function killAllLsp() {
  for (const r of running.values()) killTree(r.proc);
  running.clear();
}
