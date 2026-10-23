// Agent Client Protocol (ACP): standar terbuka agen ↔ editor (JSON-RPC 2.0 per baris di stdio).
// Dipakai Gemini CLI dan agen ACP kustom. Event diterjemahkan ke format chat panel (stream-json Claude).

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childEnv, findExecutable, killTree, runCapture, spawnable, type Ctx } from "../util";
import type { AgentStatus } from "./index";
import { installedAgent } from "./install";
import { LineRpc } from "./rpc";

type Agent = "gemini" | "acp";

interface Launch {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  shell?: boolean;
  /** Windows .cmd lewat cmd.exe: argumen sudah di-quote sendiri. */
  verbatim?: boolean;
  /** Perintah asli (tanpa pembungkus cmd.exe) untuk cek versi. */
  probe?: { cmd: string; args: string[] };
  source: "extension" | "system";
  display: string;
}

/** Cara menjalankan agen: Gemini dari paket npm (Node bawaan Electron) atau dari PATH; ACP dari Pengaturan. */
export function launchFor(ctx: Ctx, agent: Agent, command?: string): Launch | null {
  if (agent === "gemini") {
    const inst = installedAgent(ctx, "gemini");
    if (inst) {
      const env = { ...childEnv(), ELECTRON_RUN_AS_NODE: "1" };
      return { cmd: process.execPath, args: [inst.binary, "--experimental-acp"], env, probe: { cmd: process.execPath, args: [inst.binary] }, source: "extension", display: inst.binary };
    }
    const p = findExecutable("gemini");
    if (p) {
      const sp = spawnable(p, ["--experimental-acp"]);
      return { cmd: sp.cmd, args: sp.args, verbatim: sp.verbatim, env: childEnv(), probe: { cmd: p, args: [] }, source: "system", display: p };
    }
    return null;
  }
  const c = (command ?? "").trim();
  if (!c) return null;
  // Perintah ditulis pengguna sendiri di Pengaturan; dijalankan lewat shell seperti tugas terminal.
  return { cmd: c, args: [], env: childEnv(), shell: true, source: "system", display: c };
}

function geminiLoggedIn(): boolean {
  const env = process.env;
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_USE_VERTEXAI) return true;
  return fs.existsSync(path.join(os.homedir(), ".gemini", "oauth_creds.json"));
}

export async function acpStatus(ctx: Ctx, agent: Agent, command?: string): Promise<AgentStatus> {
  const l = launchFor(ctx, agent, command);
  if (!l) return { installed: false, error: agent === "acp" ? "Isi perintah agen ACP di Pengaturan → Agen AI." : null };
  if (agent === "acp") return { installed: true, path: l.display, version: null, loggedIn: null, source: "system", error: null };
  const probe = l.probe ?? { cmd: l.cmd, args: [] };
  const v = await runCapture(probe.cmd, [...probe.args, "--version"], { timeoutMs: 20_000, env: l.env }).catch(() => null);
  if (!v?.success) return { installed: false, path: l.display, source: l.source, error: `Gemini ditemukan tapi gagal jalan${v?.stderr ? `: ${v.stderr.trim().slice(0, 200)}` : "."}` };
  return { installed: true, path: l.display, version: v.stdout.trim().split("\n").pop() ?? null, loggedIn: geminiLoggedIn(), source: l.source, error: null };
}

// ---------------- Terjemahan event ----------------

const KIND_TOOL: Record<string, string> = { edit: "ApplyPatch", delete: "ApplyPatch", move: "ApplyPatch", execute: "Bash", read: "Read", search: "Grep", fetch: "WebFetch", think: "Task" };

/** tool_call ACP → input kartu alat (perintah, berkas, diff). */
export function toolInput(tc: any): Record<string, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const raw = (tc?.rawInput ?? {}) as Record<string, unknown>;
  const diffs = ((tc?.content ?? []) as { type: string; path?: string; oldText?: string | null; newText?: string }[]).filter((c) => c.type === "diff");
  const loc = (tc?.locations ?? [])[0]?.path as string | undefined;
  const input: Record<string, unknown> = { title: tc?.title ?? "" };
  if (tc?.kind === "execute") input.command = (raw.command as string) ?? tc?.title ?? "";
  const file = diffs[0]?.path ?? loc ?? (raw.file_path as string) ?? (raw.path as string);
  if (file) input.file_path = file;
  if (diffs.length) {
    input.before = diffs[0].oldText ?? "";
    input.after = diffs[0].newText ?? "";
    if (diffs.length > 1) input.changes = diffs.map((d) => ({ path: d.path, kind: d.oldText == null ? "add" : "update" }));
  }
  return input;
}

const toolText = (tc: any): string => // eslint-disable-line @typescript-eslint/no-explicit-any
  ((tc?.content ?? []) as { type: string; content?: { type: string; text?: string } }[])
    .map((c) => (c.type === "content" && c.content?.type === "text" ? c.content.text ?? "" : ""))
    .filter(Boolean)
    .join("\n");

interface Session {
  child: ChildProcess;
  rpc: LineRpc;
  agent: Agent;
  cfg: { cwd: string; model: string | null; mode: string | null };
  ready: Promise<void>;
  sessionId: string | null;
  msgId: string | null;
  text: string;
  tools: Set<string>;
  approvals: Map<string, { rpcId: number | string; options: { optionId: string; kind: string }[] }>;
  started: number;
  stderr: string;
  seq: number;
}

const sessions = new Map<string, Session>();
const emitLine = (ctx: Ctx, key: string, obj: unknown) => ctx.emit("agent-event", { run_id: key, line: JSON.stringify(obj) });

function flushText(ctx: Ctx, key: string, s: Session) {
  if (s.msgId && s.text) emitLine(ctx, key, { type: "assistant", message: { id: s.msgId, content: [{ type: "text", text: s.text }] } });
  s.msgId = null;
  s.text = "";
}

function onUpdate(ctx: Ctx, key: string, s: Session, u: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (u?.sessionUpdate) {
    case "agent_message_chunk": {
      const t = u.content?.type === "text" ? u.content.text ?? "" : "";
      if (!t) return;
      if (!s.msgId) {
        s.msgId = `acp-${Date.now()}-${++s.seq}`;
        emitLine(ctx, key, { type: "stream_event", event: { type: "message_start", message: { id: s.msgId } } });
      }
      s.text += t;
      emitLine(ctx, key, { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } } });
      return;
    }
    case "tool_call": {
      flushText(ctx, key, s);
      const id = String(u.toolCallId ?? `tool-${++s.seq}`);
      if (!s.tools.has(id)) {
        s.tools.add(id);
        emitLine(ctx, key, { type: "assistant", message: { id: `t-${id}`, content: [{ type: "tool_use", id, name: KIND_TOOL[u.kind] ?? (u.title || "Alat"), input: toolInput(u) }] } });
      }
      if (u.status === "completed" || u.status === "failed") emitLine(ctx, key, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: toolText(u), is_error: u.status === "failed" }] } });
      return;
    }
    case "tool_call_update": {
      const id = String(u.toolCallId ?? "");
      if (u.status === "completed" || u.status === "failed") emitLine(ctx, key, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: toolText(u), is_error: u.status === "failed" }] } });
      return;
    }
    case "plan": {
      flushText(ctx, key, s);
      const todos = (u.entries ?? []).map((e: { content: string; status: string }) => ({ content: e.content, status: e.status === "in_progress" ? "in_progress" : e.status }));
      emitLine(ctx, key, { type: "assistant", message: { id: `plan-${++s.seq}`, content: [{ type: "tool_use", id: `plan-${s.sessionId}`, name: "TodoWrite", input: { todos } }] } });
      return;
    }
    case "current_mode_update":
      s.cfg.mode = u.currentModeId ?? s.cfg.mode;
      return;
    case "available_commands_update": {
      // Slash command milik agen (Gemini: /memory, /tools, …): tampil di daftar "/" panel.
      const commands = ((u.availableCommands ?? []) as { name?: unknown; description?: unknown }[])
        .filter((c) => typeof c?.name === "string" && /^[\w:-]{1,60}$/.test(c.name as string))
        .map((c) => ({ name: c.name as string, description: String(c.description ?? "").slice(0, 200) }));
      emitLine(ctx, key, { type: "control_response", response: { subtype: "success", request_id: `cmds-${key}`, response: { commands } } });
      return;
    }
  }
}

function onRequest(ctx: Ctx, key: string, s: Session, id: number | string, method: string, p: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (method === "session/request_permission") {
    flushText(ctx, key, s);
    const tc = p.toolCall ?? {};
    const reqId = `acp-${id}`;
    const options = (p.options ?? []) as { optionId: string; name: string; kind: string }[];
    s.approvals.set(reqId, { rpcId: id, options });
    const toolId = String(tc.toolCallId ?? "");
    if (toolId && !s.tools.has(toolId)) {
      s.tools.add(toolId);
      emitLine(ctx, key, { type: "assistant", message: { id: `t-${toolId}`, content: [{ type: "tool_use", id: toolId, name: KIND_TOOL[tc.kind] ?? (tc.title || "Alat"), input: toolInput(tc) }] } });
    }
    emitLine(ctx, key, {
      type: "control_request",
      request_id: reqId,
      request: { subtype: "can_use_tool", tool_name: KIND_TOOL[tc.kind] ?? (tc.title || "Alat"), tool_use_id: toolId || undefined, input: toolInput(tc), permission_suggestions: options.some((o) => o.kind === "allow_always") ? [{ type: "acp", scope: "always" }] : [] },
    });
    return;
  }
  s.rpc.respondError(id, "Tidak didukung oleh Alexel Studio.");
}

async function start(ctx: Ctx, key: string, agent: Agent, cfg: Session["cfg"], command?: string): Promise<Session> {
  const l = launchFor(ctx, agent, command);
  if (!l) throw new Error(agent === "acp" ? "Isi perintah agen ACP di Pengaturan → Agen AI." : "Gemini belum terpasang.");
  const cwd = cfg.cwd && fs.existsSync(cfg.cwd) ? cfg.cwd : os.homedir();
  const child = spawn(l.cmd, l.args, { cwd, env: l.env, shell: l.shell, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: l.verbatim });
  const s = { child, agent, cfg: { ...cfg, cwd }, sessionId: null, msgId: null, text: "", tools: new Set(), approvals: new Map(), started: Date.now(), stderr: "", seq: 0 } as unknown as Session;
  s.rpc = new LineRpc(child, { onNotify: (m, p) => m === "session/update" && (!s.sessionId || p?.sessionId === s.sessionId) && onUpdate(ctx, key, s, p.update), onRequest: (id, m, p) => onRequest(ctx, key, s, id, m, p) }, true);
  sessions.set(key, s);
  child.stderr?.on("data", (b: Buffer) => {
    if (s.stderr.length < 8000) s.stderr += b.toString("utf8");
  });
  child.on("error", (e) => (s.stderr += e.message));
  child.on("close", (code, signal) => {
    if (sessions.get(key) === s) sessions.delete(key);
    ctx.emit("agent-done", { run_id: key, code: signal ? 130 : code, stderr: s.stderr.slice(0, 4000), replaced: sessions.has(key) });
  });
  s.ready = (async () => {
    await s.rpc.request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } }, 60_000);
    const res = await s.rpc.request<any>("session/new", { cwd, mcpServers: [] }, 120_000); // eslint-disable-line @typescript-eslint/no-explicit-any
    s.sessionId = res.sessionId;
    const models = (res.models?.availableModels ?? []) as { modelId: string; name: string; description?: string }[];
    const modes = (res.modes?.availableModes ?? []) as { id: string; name: string; description?: string }[];
    emitLine(ctx, key, {
      type: "control_response",
      response: { subtype: "success", request_id: `init-${key}`, response: { models: models.map((m) => ({ value: m.modelId, displayName: m.name, description: m.description ?? "" })), modes: modes.map((m) => ({ id: m.id, label: m.name, hint: m.description ?? "" })), commands: [] } },
    });
    emitLine(ctx, key, { type: "system", subtype: "init", session_id: s.sessionId, model: res.models?.currentModelId ?? agent });
    if (cfg.model && models.some((m) => m.modelId === cfg.model)) await s.rpc.request("session/set_model", { sessionId: s.sessionId, modelId: cfg.model }, 30_000).catch(() => {});
    if (cfg.mode && modes.some((m) => m.id === cfg.mode)) await s.rpc.request("session/set_mode", { sessionId: s.sessionId, modeId: cfg.mode }, 30_000).catch(() => {});
  })();
  s.ready.catch((e) => {
    s.stderr += String(e?.message ?? e);
    killTree(child);
  });
  return s;
}

function toPrompt(content: unknown) {
  const out: Record<string, unknown>[] = [];
  for (const b of (Array.isArray(content) ? content : [{ type: "text", text: String(content) }]) as { type: string; text?: string; source?: { media_type: string; data: string } }[]) {
    if (b.type === "text" && typeof b.text === "string") out.push({ type: "text", text: b.text });
    else if (b.type === "image" && b.source) out.push({ type: "image", mimeType: b.source.media_type, data: b.source.data });
  }
  if (!out.length) throw new Error("Pesan kosong.");
  return out;
}

export async function acpSend(ctx: Ctx, agent: Agent, key: string, raw: Record<string, unknown>, content: unknown) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(key)) throw new Error("Sesi tidak valid.");
  const prompt = toPrompt(content);
  const cfg = { cwd: typeof raw.cwd === "string" ? raw.cwd : "", model: typeof raw.model === "string" ? raw.model : null, mode: typeof raw.mode === "string" && raw.mode !== "default" ? raw.mode : null };
  let s = sessions.get(key);
  if (!s) s = await start(ctx, key, agent, cfg, typeof raw.command === "string" ? raw.command : undefined);
  else {
    if (cfg.model && cfg.model !== s.cfg.model) await s.rpc.request("session/set_model", { sessionId: s.sessionId, modelId: cfg.model }, 30_000).catch(() => {});
    if (cfg.mode && cfg.mode !== s.cfg.mode) await s.rpc.request("session/set_mode", { sessionId: s.sessionId, modeId: cfg.mode }, 30_000).catch(() => {});
    s.cfg = { ...s.cfg, model: cfg.model, mode: cfg.mode };
  }
  try {
    await s.ready;
  } catch (e) {
    throw new Error(authHint(e));
  }
  s.started = Date.now();
  s.tools.clear();
  const sess = s;
  void sess.rpc
    .request<{ stopReason?: string }>("session/prompt", { sessionId: sess.sessionId, prompt })
    .then((r) => {
      flushText(ctx, key, sess);
      const cancelled = r?.stopReason === "cancelled";
      emitLine(ctx, key, { type: "result", subtype: cancelled ? "error_during_execution" : "success", is_error: cancelled, result: cancelled ? "interrupted" : "", session_id: sess.sessionId, duration_ms: Date.now() - sess.started });
    })
    .catch((e) => {
      flushText(ctx, key, sess);
      emitLine(ctx, key, { type: "result", subtype: "error_during_execution", is_error: true, result: authHint(e), session_id: sess.sessionId, duration_ms: Date.now() - sess.started });
    });
}

const authHint = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /auth|login|credential|api key/i.test(m) ? `${m}\n\nKamu perlu masuk dulu. Klik **Masuk** di panel.` : m;
};

export function acpControl(key: string, msg: unknown): boolean {
  const s = sessions.get(key);
  if (!s) return false;
  const m = msg as { type?: string; request?: { subtype?: string; mode?: string; model?: string }; response?: { request_id?: string; response?: { behavior?: string; updatedPermissions?: unknown[] } } };
  if (m?.type === "control_response") {
    const a = s.approvals.get(String(m.response?.request_id ?? ""));
    if (!a) return false;
    s.approvals.delete(String(m.response?.request_id));
    const r = m.response?.response ?? {};
    const want = r.behavior !== "allow" ? ["reject_once", "reject_always"] : Array.isArray(r.updatedPermissions) && r.updatedPermissions.length ? ["allow_always", "allow_once"] : ["allow_once", "allow_always"];
    const opt = want.map((k) => a.options.find((o) => o.kind === k)).find(Boolean);
    s.rpc.respond(a.rpcId, opt ? { outcome: { outcome: "selected", optionId: opt.optionId } } : { outcome: { outcome: "cancelled" } });
    return true;
  }
  if (m?.type === "control_request") {
    const sub = m.request?.subtype;
    if (sub === "interrupt" && s.sessionId) s.rpc.notify("session/cancel", { sessionId: s.sessionId });
    else if (sub === "set_model" && s.sessionId && m.request?.model && m.request.model !== "default") {
      s.cfg.model = m.request.model;
      void s.rpc.request("session/set_model", { sessionId: s.sessionId, modelId: m.request.model }, 30_000).catch(() => {});
    } else if (sub === "set_permission_mode" && s.sessionId && m.request?.mode) {
      s.cfg.mode = m.request.mode;
      void s.rpc.request("session/set_mode", { sessionId: s.sessionId, modeId: m.request.mode }, 30_000).catch(() => {});
    }
    return true;
  }
  return false;
}

export function acpClose(key: string) {
  const s = sessions.get(key);
  if (!s) return;
  sessions.delete(key);
  try {
    s.child.stdin?.end();
  } catch {
    /* sudah tertutup */
  }
  const t = setTimeout(() => killTree(s.child), 1500);
  s.child.once("close", () => clearTimeout(t));
}

export function killAllAcp() {
  for (const s of sessions.values()) killTree(s.child);
  sessions.clear();
}

/** Masuk lewat metode autentikasi ACP pertama (Gemini: login Google di browser). */
export async function acpLogin(ctx: Ctx, agent: Agent, command?: string): Promise<string> {
  const l = launchFor(ctx, agent, command);
  if (!l) throw new Error("Agen belum terpasang.");
  const child = spawn(l.cmd, l.args, { cwd: os.homedir(), env: l.env, shell: l.shell, stdio: ["pipe", "pipe", "ignore"], windowsHide: true, windowsVerbatimArguments: l.verbatim });
  const rpc = new LineRpc(child, { onNotify: () => {}, onRequest: (id) => rpc.respondError(id, "Tidak didukung.") }, true);
  try {
    const init = await rpc.request<{ authMethods?: { id: string; name: string }[] }>("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } }, 60_000);
    const method = init.authMethods?.find((m) => /oauth|google|login/i.test(`${m.id} ${m.name}`)) ?? init.authMethods?.[0];
    if (!method) throw new Error("Agen ini tidak menyediakan cara masuk.");
    await rpc.request("authenticate", { methodId: method.id }, 5 * 60_000);
    return method.name;
  } finally {
    killTree(child);
  }
}
