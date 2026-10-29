// Kernel notebook lewat Jupyter Server lokal: server dijalankan sekali per project (token acak, hanya
// 127.0.0.1), kernel dibuat lewat REST, sel dijalankan lewat WebSocket (protokol pesan Jupyter v5).
// Output dikirim ke renderer sebagai event "jupyter-event".

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import WebSocket from "ws";
import { childEnv, findExecutable, isWin, killTree, type Ctx } from "./util";

interface Server {
  root: string;
  proc: ChildProcess;
  port: number;
  token: string;
  ready: Promise<void>;
  log: string;
}

interface Kernel {
  id: string;
  server: Server;
  ws: WebSocket;
  session: string;
  /** msg_id execute_request → id sel di renderer. */
  runs: Map<string, string>;
  name: string;
}

const servers = new Map<string, Server>();
const kernels = new Map<string, Kernel>();

/** Cari `jupyter`: setelan pengguna, venv project, lalu PATH. */
export function findJupyter(root: string, configured?: string | null): string | null {
  if (configured && fs.existsSync(configured)) return configured;
  const bin = isWin ? path.join("Scripts", "jupyter.exe") : path.join("bin", "jupyter");
  for (const v of [".venv", "venv", "env", ".env-py"]) {
    const p = path.join(root, v, bin);
    if (fs.existsSync(p)) return p;
  }
  return findExecutable("jupyter");
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.unref();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => res(port));
    });
  });
}

async function startServer(root: string, configured?: string | null): Promise<Server> {
  const cur = servers.get(root);
  if (cur && cur.proc.exitCode === null) {
    await cur.ready;
    return cur;
  }
  const exe = findJupyter(root, configured);
  if (!exe) throw new Error("JUPYTER_MISSING");
  const port = await freePort();
  const token = randomBytes(24).toString("hex");
  const proc = spawn(exe, ["server", "--no-browser", `--port=${port}`, "--ip=127.0.0.1", `--ServerApp.root_dir=${root}`, `--IdentityProvider.token=${token}`, "--ServerApp.disable_check_xsrf=True", "--ServerApp.port_retries=0"], { cwd: root, env: childEnv({ JUPYTER_TOKEN: token }), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const s: Server = { root, proc, port, token, log: "", ready: Promise.resolve() };
  const onData = (d: Buffer) => (s.log = (s.log + d.toString()).slice(-8000));
  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);
  s.ready = new Promise<void>((res, rej) => {
    const t0 = Date.now();
    const poll = async () => {
      if (proc.exitCode !== null) return rej(new Error(`Jupyter Server berhenti: ${s.log.trim().split("\n").slice(-4).join("\n")}`));
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { Authorization: `token ${token}` } });
        if (r.ok) return res();
      } catch {
        /* belum siap */
      }
      if (Date.now() - t0 > 60_000) return rej(new Error("Jupyter Server tidak siap dalam 60 detik."));
      setTimeout(poll, 300);
    };
    void poll();
  });
  proc.on("exit", () => {
    for (const [id, k] of kernels) if (k.server === s) kernels.delete(id);
    if (servers.get(root) === s) servers.delete(root);
  });
  servers.set(root, s);
  await s.ready;
  return s;
}

async function api<T>(s: Server, method: string, p: string, body?: unknown): Promise<T> {
  const r = await fetch(`http://127.0.0.1:${s.port}${p}`, { method, headers: { Authorization: `token ${s.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`Jupyter ${method} ${p}: ${r.status} ${await r.text().catch(() => "")}`.slice(0, 400));
  const t = await r.text();
  return (t ? JSON.parse(t) : null) as T;
}

export async function kernelSpecs(root: string, configured?: string | null): Promise<{ default: string; specs: { name: string; display: string; language: string }[] }> {
  const s = await startServer(root, configured);
  const r = await api<{ default: string; kernelspecs: Record<string, { name: string; spec: { display_name: string; language: string } }> }>(s, "GET", "/api/kernelspecs");
  return { default: r.default, specs: Object.values(r.kernelspecs).map((k) => ({ name: k.name, display: k.spec.display_name, language: k.spec.language })) };
}

function msg(session: string, type: string, content: unknown, channel = "shell") {
  return { header: { msg_id: randomUUID(), username: "alexel", session, msg_type: type, version: "5.3", date: new Date().toISOString() }, parent_header: {}, metadata: {}, content, buffers: [], channel };
}

/** Buat kernel; kembalikan id. Output sel dikirim lewat event. */
export async function startKernel(ctx: Ctx, root: string, name: string | null, configured?: string | null): Promise<{ id: string; name: string }> {
  const s = await startServer(root, configured);
  const k = await api<{ id: string; name: string }>(s, "POST", "/api/kernels", name ? { name } : {});
  const session = randomUUID();
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/api/kernels/${k.id}/channels?session_id=${session}`, { headers: { Authorization: `token ${s.token}` } });
  const kernel: Kernel = { id: k.id, server: s, ws, session, runs: new Map(), name: k.name };
  kernels.set(k.id, kernel);
  ws.on("message", (raw) => {
    let m: { header: { msg_type: string }; parent_header: { msg_id?: string }; content: Record<string, unknown>; channel?: string };
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const type = m.header?.msg_type;
    if (type === "status") ctx.emit("jupyter-event", { kernel: k.id, type: "status", state: m.content.execution_state });
    const cell = m.parent_header?.msg_id ? kernel.runs.get(m.parent_header.msg_id) : undefined;
    if (!cell) return;
    if (type === "stream" || type === "display_data" || type === "execute_result" || type === "error" || type === "update_display_data") {
      const out = type === "stream" ? { output_type: "stream", name: m.content.name, text: m.content.text } : type === "error" ? { output_type: "error", ename: m.content.ename, evalue: m.content.evalue, traceback: m.content.traceback } : { output_type: type === "update_display_data" ? "display_data" : type, data: m.content.data, metadata: m.content.metadata ?? {}, ...(type === "execute_result" ? { execution_count: m.content.execution_count } : {}) };
      ctx.emit("jupyter-event", { kernel: k.id, cell, type: "output", output: out });
    } else if (type === "clear_output") ctx.emit("jupyter-event", { kernel: k.id, cell, type: "clear" });
    else if (type === "execute_input") ctx.emit("jupyter-event", { kernel: k.id, cell, type: "count", count: m.content.execution_count });
    else if (type === "execute_reply") {
      ctx.emit("jupyter-event", { kernel: k.id, cell, type: "done", status: m.content.status, count: m.content.execution_count });
      kernel.runs.delete(m.parent_header.msg_id!);
    }
  });
  ws.on("close", () => {
    for (const cell of kernel.runs.values()) ctx.emit("jupyter-event", { kernel: k.id, cell, type: "done", status: "error" });
    kernel.runs.clear();
    ctx.emit("jupyter-event", { kernel: k.id, type: "status", state: "dead" });
  });
  await new Promise<void>((res, rej) => {
    ws.once("open", () => res());
    ws.once("error", rej);
  });
  return { id: k.id, name: k.name };
}

function kernel(id: string): Kernel {
  const k = kernels.get(id);
  if (!k || k.ws.readyState !== WebSocket.OPEN) throw new Error("Kernel tidak berjalan.");
  return k;
}

export function execute(id: string, cell: string, code: string) {
  const k = kernel(id);
  const m = msg(k.session, "execute_request", { code, silent: false, store_history: true, user_expressions: {}, allow_stdin: false, stop_on_error: true });
  k.runs.set(m.header.msg_id, cell);
  k.ws.send(JSON.stringify(m));
}

export async function interrupt(id: string) {
  const k = kernel(id);
  await api(k.server, "POST", `/api/kernels/${id}/interrupt`);
}

export async function restart(id: string) {
  const k = kernel(id);
  await api(k.server, "POST", `/api/kernels/${id}/restart`);
}

export async function shutdownKernel(id: string) {
  const k = kernels.get(id);
  if (!k) return;
  kernels.delete(id);
  try {
    k.ws.close();
    await api(k.server, "DELETE", `/api/kernels/${id}`);
  } catch {
    /* server sudah mati */
  }
}

export function stopAllJupyter() {
  for (const k of kernels.values()) k.ws.close();
  kernels.clear();
  for (const s of servers.values()) if (s.proc.exitCode === null) killTree(s.proc);
  servers.clear();
}
