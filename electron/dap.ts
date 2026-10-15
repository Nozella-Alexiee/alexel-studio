// Debug Adapter Protocol (DAP): menjalankan debug adapter dan meneruskan pesan JSON mentah
// ke renderer (event `dap-message`). Adapter yang didukung:
//   lldb  — lldb-dap (C, C++, Rust, Swift), bawaan Xcode/LLVM
//   node  — js-debug resmi Microsoft (JavaScript/TypeScript), diunduh sekali dengan SHA-256 tersemat
//   python — debugpy (python -m debugpy.adapter)
//   go    — Delve (dlv dap)
// Protokolnya (initialize, launch, breakpoint, step) dijalankan di renderer (src/debug).

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { extractTar } from "./agents/install";
import { frame, parseFrames } from "./lsp";
import { childEnv, findExecutable, killTree, runCapture, spawnable, type Ctx } from "./util";

export type AdapterKind = "lldb" | "node" | "python" | "go";

const JS_DEBUG = {
  version: "v1.140.0",
  url: "https://github.com/microsoft/vscode-js-debug/releases/download/v1.140.0/js-debug-dap-v1.140.0.tar.gz",
  sha256: "27dab92937ec1ab35821ae955aac867544fe06a1b6307229049f2d789af10968",
};

const jsDebugDir = (ctx: Ctx) => path.join(ctx.userData, "debug", `js-debug-${JS_DEBUG.version}`);

function findFile(dir: string, name: string, depth = 4): string | null {
  if (depth < 0 || !fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) {
      const f = findFile(p, name, depth - 1);
      if (f) return f;
    }
  }
  return null;
}

async function lldbDap(): Promise<string | null> {
  const p = findExecutable("lldb-dap") ?? findExecutable("lldb-vscode");
  if (p) return p;
  if (process.platform === "darwin") {
    const r = await runCapture("xcrun", ["-f", "lldb-dap"], { timeoutMs: 10_000 }).catch(() => null);
    if (r?.success && r.stdout.trim() && fs.existsSync(r.stdout.trim())) return r.stdout.trim();
  }
  return null;
}

const pythonExe = () => findExecutable("python3") ?? findExecutable("python");

export interface AdapterStatus {
  kind: AdapterKind;
  available: boolean;
  /** Bisa dipasang otomatis oleh Alexel Studio (js-debug). */
  installable?: boolean;
  /** Perintah pemasangan untuk ditampilkan/dijalankan di terminal. */
  install?: string | null;
  detail?: string | null;
}

export async function adapterStatus(ctx: Ctx, kind: AdapterKind): Promise<AdapterStatus> {
  if (kind === "lldb") {
    const p = await lldbDap();
    return { kind, available: !!p, detail: p, install: p ? null : process.platform === "darwin" ? "xcode-select --install" : process.platform === "win32" ? "winget install LLVM.LLVM" : "sudo apt install lldb" };
  }
  if (kind === "node") {
    const f = findFile(jsDebugDir(ctx), "dapDebugServer.js");
    return { kind, available: !!f, installable: !f, detail: f };
  }
  if (kind === "python") {
    const py = pythonExe();
    if (!py) return { kind, available: false, install: "Pasang Python 3 dulu" };
    const r = await runCapture(py, ["-c", "import debugpy; print(debugpy.__version__)"], { timeoutMs: 15_000 }).catch(() => null);
    return { kind, available: !!r?.success, detail: r?.success ? `debugpy ${r.stdout.trim()}` : null, install: r?.success ? null : `${path.basename(py)} -m pip install debugpy` };
  }
  const dlv = findExecutable("dlv");
  return { kind, available: !!dlv, detail: dlv, install: dlv ? null : "go install github.com/go-delve/delve/cmd/dlv@latest" };
}

/** Unduh js-debug (debug adapter resmi VS Code untuk Node/TS) sekali, dengan SHA-256 tersemat. */
export async function installJsDebug(ctx: Ctx): Promise<string> {
  const res = await fetch(JS_DEBUG.url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new Error(`Unduhan js-debug gagal (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (createHash("sha256").update(buf).digest("hex") !== JS_DEBUG.sha256) throw new Error("Checksum js-debug tidak cocok; berkas dibuang.");
  const dir = jsDebugDir(ctx);
  fs.rmSync(dir, { recursive: true, force: true });
  extractTar(zlib.gunzipSync(buf), dir, () => true);
  const f = findFile(dir, "dapDebugServer.js");
  if (!f) throw new Error("js-debug tidak berisi dapDebugServer.js.");
  return f;
}

// ---------------- Sesi adapter ----------------

interface Conn {
  write: (s: string) => void;
  close: () => void;
}

interface DapSession {
  id: string;
  proc?: ChildProcess;
  conn?: Conn;
  /** Port TCP adapter (js-debug, dlv) untuk sesi anak (startDebugging). */
  port?: number;
  buf: Buffer;
  stderr: string;
}

const sessions = new Map<string, DapSession>();
const validId = (s: unknown): s is string => typeof s === "string" && /^[\w-]{1,64}$/.test(s);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function onData(ctx: Ctx, s: DapSession, chunk: Buffer) {
  const { messages, rest } = parseFrames(Buffer.concat([s.buf, chunk]));
  s.buf = rest;
  for (const message of messages) ctx.emit("dap-message", { id: s.id, message });
}

function connectTcp(ctx: Ctx, s: DapSession, port: number, tries = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        s.conn = { write: (x) => sock.write(x), close: () => sock.destroy() };
        sock.on("data", (c: Buffer) => onData(ctx, s, c));
        sock.on("close", () => {
          if (sessions.get(s.id) === s && !s.proc) {
            sessions.delete(s.id);
            ctx.emit("dap-exit", { id: s.id, code: 0, stderr: "" });
          }
        });
        resolve();
      });
      sock.once("error", (e) => {
        sock.destroy();
        if (n <= 0) reject(e);
        else setTimeout(() => attempt(n - 1), 150);
      });
    };
    attempt(tries);
  });
}

function watchProc(ctx: Ctx, s: DapSession, proc: ChildProcess) {
  s.proc = proc;
  proc.stderr?.on("data", (b: Buffer) => {
    if (s.stderr.length < 8000) s.stderr += b.toString("utf8");
  });
  proc.on("error", (e) => (s.stderr += e.message));
  proc.on("close", (code) => {
    if (sessions.get(s.id) === s) sessions.delete(s.id);
    // Sesi anak yang memakai adapter ini ikut berakhir.
    for (const [k, c] of sessions) if (c.port && c.port === s.port && !c.proc) {
      c.conn?.close();
      sessions.delete(k);
      ctx.emit("dap-exit", { id: k, code, stderr: "" });
    }
    ctx.emit("dap-exit", { id: s.id, code, stderr: s.stderr.slice(0, 4000) });
  });
}

export async function dapStart(ctx: Ctx, id: string, kind: AdapterKind, cwd: string): Promise<{ id: string }> {
  if (!validId(id)) throw new Error("Sesi debug tidak valid.");
  if (sessions.has(id)) throw new Error("Sesi debug sudah berjalan.");
  const dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  const s: DapSession = { id, buf: Buffer.alloc(0), stderr: "" };
  sessions.set(id, s);
  try {
    if (kind === "lldb" || kind === "python") {
      const exe = kind === "lldb" ? await lldbDap() : pythonExe();
      if (!exe) throw new Error(kind === "lldb" ? "lldb-dap tidak ditemukan." : "Python tidak ditemukan.");
      const sp = spawnable(exe, kind === "python" ? ["-m", "debugpy.adapter"] : []);
      const proc = spawn(sp.cmd, sp.args, { cwd: dir, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
      watchProc(ctx, s, proc);
      proc.stdout?.on("data", (c: Buffer) => onData(ctx, s, c));
      proc.stdin?.on("error", () => {});
      s.conn = { write: (x) => proc.stdin?.write(x), close: () => proc.stdin?.end() };
    } else {
      const port = await freePort();
      s.port = port;
      let proc: ChildProcess;
      if (kind === "node") {
        const server = findFile(jsDebugDir(ctx), "dapDebugServer.js");
        if (!server) throw new Error("js-debug belum dipasang.");
        // Node bawaan Electron menjalankan adapter; program pengguna tetap memakai `node` dari PATH.
        proc = spawn(process.execPath, [server, String(port), "127.0.0.1"], { cwd: dir, env: { ...childEnv(), ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      } else {
        const dlv = findExecutable("dlv");
        if (!dlv) throw new Error("Delve (dlv) tidak ditemukan.");
        const sp = spawnable(dlv, ["dap", "--listen", `127.0.0.1:${port}`]);
        proc = spawn(sp.cmd, sp.args, { cwd: dir, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
      }
      watchProc(ctx, s, proc);
      await connectTcp(ctx, s, port);
    }
    return { id };
  } catch (e) {
    sessions.delete(id);
    if (s.proc) killTree(s.proc);
    throw e;
  }
}

/** Sesi anak untuk permintaan `startDebugging` (js-debug): koneksi baru ke adapter yang sama. */
export async function dapStartChild(ctx: Ctx, parent: string, id: string): Promise<{ id: string }> {
  const p = sessions.get(parent);
  if (!p?.port) throw new Error("Adapter ini tidak mendukung sesi anak.");
  if (!validId(id) || sessions.has(id)) throw new Error("Sesi debug tidak valid.");
  const s: DapSession = { id, buf: Buffer.alloc(0), stderr: "", port: p.port };
  sessions.set(id, s);
  await connectTcp(ctx, s, p.port);
  return { id };
}

export function dapSend(id: string, message: unknown) {
  const s = sessions.get(id);
  if (!s?.conn) throw new Error("Sesi debug tidak berjalan.");
  s.conn.write(frame(typeof message === "string" ? message : JSON.stringify(message)));
}

export function dapStop(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  s.conn?.close();
  if (s.proc) {
    const t = setTimeout(() => s.proc && killTree(s.proc), 1500);
    s.proc.once("close", () => clearTimeout(t));
  }
}

export function killAllDap() {
  for (const s of sessions.values()) {
    s.conn?.close();
    if (s.proc) killTree(s.proc);
  }
  sessions.clear();
}

/** Kompilasi C/C++ dengan simbol debug ke folder sementara (untuk "debug berkas ini"). */
export async function buildForDebug(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  const cpp = [".cpp", ".cc", ".cxx", ".c++"].includes(ext);
  if (![".c", ...(cpp ? [ext] : [])].includes(ext) && !cpp) throw new Error("Hanya berkas C/C++ yang bisa dikompilasi otomatis.");
  const cc = findExecutable(cpp ? "clang++" : "clang") ?? findExecutable(cpp ? "g++" : "gcc");
  if (!cc) throw new Error("Compiler C/C++ tidak ditemukan.");
  const out = path.join(os.tmpdir(), `alexel-debug-${createHash("sha1").update(file).digest("hex").slice(0, 10)}${process.platform === "win32" ? ".exe" : ""}`);
  const r = await runCapture(cc, ["-g", "-O0", file, "-o", out], { cwd: path.dirname(file), timeoutMs: 120_000 });
  if (!r.success) throw new Error(`Kompilasi gagal:\n${(r.stderr || r.stdout).trim().slice(0, 3000)}`);
  return out;
}
