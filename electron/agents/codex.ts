// Codex (OpenAI) lewat `codex app-server`: JSON-RPC per baris di stdin/stdout, protokol yang
// sama dengan ekstensi Codex di VS Code. Event diterjemahkan ke bentuk stream-json Claude
// supaya panel Agen AI cukup memahami satu format (teks, alat, kartu izin, hasil).

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childEnv, findExecutable, killTree, runCapture, spawnable, type Ctx } from "../util";
import type { AgentStatus } from "./index";
import { installedAgent } from "./install";
import { LineRpc } from "./rpc";

export function findCodex(ctx: Ctx): { path: string; source: "extension" | "system" } | null {
  const inst = installedAgent(ctx, "codex");
  if (inst) return { path: inst.binary, source: "extension" };
  const p = findExecutable("codex");
  return p ? { path: p, source: "system" } : null;
}

export async function codexStatus(ctx: Ctx): Promise<AgentStatus> {
  const f = findCodex(ctx);
  if (!f) return { installed: false, error: null };
  const v = await runCapture(f.path, ["--version"], { timeoutMs: 15_000 }).catch(() => null);
  if (!v?.success) return { installed: false, path: f.path, source: f.source, error: `Codex ditemukan tapi gagal jalan${v?.stderr ? `: ${v.stderr.trim().slice(0, 200)}` : "."}` };
  const login = await runCapture(f.path, ["login", "status"], { timeoutMs: 15_000 }).catch(() => null);
  const text = `${login?.stdout ?? ""}${login?.stderr ?? ""}`;
  const loggedIn = login ? login.success && !/not logged in/i.test(text) : null;
  const plan = /chatgpt/i.test(text) ? "chatgpt" : /api key/i.test(text) ? "api key" : null;
  return { installed: true, path: f.path, version: v.stdout.trim(), loggedIn, plan, source: f.source, error: null };
}

// ---------------- Mode izin ----------------

/** Mode panel → kebijakan persetujuan & sandbox Codex. */
export function codexPolicy(mode: unknown): { approvalPolicy: "untrusted" | "on-request"; sandbox: "read-only" | "workspace-write" } {
  if (mode === "read-only") return { approvalPolicy: "on-request", sandbox: "read-only" };
  if (mode === "on-request") return { approvalPolicy: "on-request", sandbox: "workspace-write" };
  return { approvalPolicy: "untrusted", sandbox: "workspace-write" };
}

function sandboxPolicy(sandbox: string, cwd: string) {
  return sandbox === "read-only" ? { type: "readOnly", networkAccess: false } : { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
}

// ---------------- Sesi ----------------

interface Cfg {
  cwd: string;
  model: string | null;
  effort: string | null;
  mode: string;
  resume: string | null;
}

interface Session {
  child: ChildProcess;
  rpc: LineRpc;
  cfg: Cfg;
  ready: Promise<void>;
  threadId: string | null;
  turnId: string | null;
  defaultModel: string | null;
  contextWindow: number | null;
  items: Map<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** request_id kartu izin → id permintaan JSON-RPC dan jenisnya. */
  approvals: Map<string, { rpcId: number | string; kind: "command" | "file" | "input"; questions?: { id: string; question: string }[] }>;
  started: number;
  lastUsage: { input: number; window: number | null } | null;
  error: string | null;
  stderr: string;
}

const sessions = new Map<string, Session>();
const validId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9-]{1,80}$/.test(s);
const validModel = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(s) && s !== "default";
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra", "minimal", "none"];

function sanitize(raw: Record<string, unknown>): Cfg {
  return {
    cwd: typeof raw.cwd === "string" ? raw.cwd : "",
    model: validModel(raw.model) ? raw.model : null,
    effort: typeof raw.effort === "string" && EFFORTS.includes(raw.effort) ? raw.effort : null,
    mode: typeof raw.mode === "string" ? raw.mode : "untrusted",
    resume: validId(raw.resume) ? raw.resume : null,
  };
}

const emitLine = (ctx: Ctx, key: string, obj: unknown) => ctx.emit("agent-event", { run_id: key, line: JSON.stringify(obj) });

const TOOL_NAME: Record<string, string> = { commandExecution: "Bash", fileChange: "ApplyPatch", mcpToolCall: "MCP", webSearch: "WebSearch", imageView: "Read" };

/**
 * Diff satu perubahan. Untuk berkas baru/dihapus Codex bisa mengirim isi mentahnya (bukan unified
 * diff); jadikan baris +/- supaya kartu izin tetap menampilkan isinya.
 */
export function changeDiff(c: { kind?: { type?: string }; diff?: string }): string {
  const d = c.diff ?? "";
  if (/^(@@|diff --git|--- |\+\+\+ )/m.test(d)) return d;
  const sign = c.kind?.type === "delete" ? "-" : c.kind?.type === "add" ? "+" : null;
  if (!sign) return d;
  return d.replace(/\n$/, "").split("\n").map((l) => sign + l).join("\n");
}

/** Item Codex → input alat untuk kartu di panel. */
export function itemInput(item: any): Record<string, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (item?.type) {
    case "commandExecution":
      return { command: item.command ?? "", cwd: item.cwd };
    case "fileChange": {
      const changes = (item.changes ?? []) as { path: string; kind: { type: string }; diff: string }[];
      return { file_path: changes[0]?.path ?? "", changes: changes.map((c) => ({ path: c.path, kind: c.kind?.type ?? "update" })), diff: changes.map(changeDiff).join("\n") };
    }
    case "mcpToolCall":
      return { server: item.server, tool: item.tool, arguments: item.arguments };
    case "webSearch":
      return { query: item.query ?? "" };
    default:
      return {};
  }
}

function onNotify(ctx: Ctx, key: string, s: Session, method: string, p: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (p?.threadId && s.threadId && p.threadId !== s.threadId) return; // sub-agen / thread lain
  switch (method) {
    case "turn/started":
      s.turnId = p.turn?.id ?? s.turnId;
      s.error = null;
      return;
    case "item/started": {
      const it = p.item;
      if (!it?.id) return;
      s.items.set(it.id, it);
      if (it.type === "agentMessage") emitLine(ctx, key, { type: "stream_event", event: { type: "message_start", message: { id: it.id } } });
      else if (TOOL_NAME[it.type]) emitLine(ctx, key, { type: "assistant", message: { id: `t-${it.id}`, content: [{ type: "tool_use", id: it.id, name: TOOL_NAME[it.type], input: itemInput(it) }] } });
      return;
    }
    case "item/fileChange/patchUpdated": {
      const it = s.items.get(p.itemId) ?? { type: "fileChange", id: p.itemId };
      s.items.set(p.itemId, { ...it, changes: p.changes ?? [] });
      return;
    }
    case "item/agentMessage/delta":
      emitLine(ctx, key, { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p.delta ?? "" } } });
      return;
    case "item/completed": {
      const it = p.item;
      if (!it?.id) return;
      s.items.set(it.id, it);
      if (it.type === "agentMessage" && it.text) emitLine(ctx, key, { type: "assistant", message: { id: it.id, content: [{ type: "text", text: it.text }] } });
      else if (TOOL_NAME[it.type]) {
        const failed = it.status === "failed" || it.status === "declined" || (it.type === "commandExecution" && typeof it.exitCode === "number" && it.exitCode !== 0);
        const out = it.type === "commandExecution" ? it.aggregatedOutput ?? "" : it.type === "fileChange" ? (it.changes ?? []).map((c: { path: string }) => c.path).join("\n") : JSON.stringify(it.result ?? it.error ?? "").slice(0, 4000);
        emitLine(ctx, key, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: it.id, content: it.status === "declined" ? "Ditolak oleh pengguna" : String(out).slice(0, 8000), is_error: failed }] } });
      }
      return;
    }
    case "turn/plan/updated": {
      const todos = (p.plan ?? []).map((x: { step: string; status: string }) => ({ content: x.step, status: x.status === "inProgress" ? "in_progress" : x.status }));
      emitLine(ctx, key, { type: "assistant", message: { id: `plan-${Date.now()}`, content: [{ type: "tool_use", id: `plan-${p.turnId}`, name: "TodoWrite", input: { todos } }] } });
      return;
    }
    case "thread/tokenUsage/updated":
      s.lastUsage = { input: p.tokenUsage?.last?.inputTokens ?? 0, window: p.tokenUsage?.modelContextWindow ?? null };
      return;
    case "error":
      if (!p?.willRetry) s.error = parseError(p?.error?.message);
      return;
    case "turn/completed": {
      const t = p.turn ?? {};
      const failed = t.status === "failed";
      const interrupted = t.status === "interrupted";
      s.turnId = null;
      const model = s.cfg.model ?? s.defaultModel ?? "codex";
      // Token konteks giliran terakhir (dibaca panel dari message_start.usage).
      if (s.lastUsage) emitLine(ctx, key, { type: "stream_event", event: { type: "message_start", message: { id: `usage-${Date.now()}`, usage: { input_tokens: s.lastUsage.input } } } });
      emitLine(ctx, key, {
        type: "result",
        subtype: failed ? "error_during_execution" : interrupted ? "error_during_execution" : "success",
        is_error: failed || interrupted,
        result: interrupted ? "interrupted" : failed ? s.error ?? parseError(t.error?.message) ?? "Codex berhenti dengan error." : "",
        session_id: s.threadId,
        duration_ms: t.durationMs ?? Date.now() - s.started,
        num_turns: Array.isArray(t.items) ? t.items.length : undefined,
        modelUsage: { [model]: { contextWindow: s.lastUsage?.window ?? s.contextWindow ?? 272_000 } },
      });
      return;
    }
  }
}

/** Pesan error Codex sering berupa JSON API; ambil kalimatnya saja. */
export function parseError(msg: unknown): string | null {
  if (typeof msg !== "string" || !msg) return null;
  try {
    const j = JSON.parse(msg);
    return j?.error?.message ?? j?.message ?? msg;
  } catch {
    return msg;
  }
}

function onRequest(ctx: Ctx, key: string, s: Session, id: number | string, method: string, p: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const reqId = `codex-${id}`;
  if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
    s.approvals.set(reqId, { rpcId: id, kind: "command" });
    const command = Array.isArray(p.command) ? p.command.join(" ") : p.command ?? "";
    emitLine(ctx, key, { type: "control_request", request_id: reqId, request: { subtype: "can_use_tool", tool_name: "Bash", tool_use_id: p.itemId, input: { command, description: p.reason ?? undefined }, permission_suggestions: [{ type: "codex", scope: "session" }] } });
    return;
  }
  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    s.approvals.set(reqId, { rpcId: id, kind: "file" });
    void (async () => {
      // Isi perubahan bisa datang sesaat setelah permintaan izin (item/fileChange/patchUpdated).
      for (let i = 0; i < 15 && !s.items.get(p.itemId)?.changes?.length; i++) await new Promise((r) => setTimeout(r, 100));
      const it = s.items.get(p.itemId);
      emitLine(ctx, key, { type: "control_request", request_id: reqId, request: { subtype: "can_use_tool", tool_name: "ApplyPatch", tool_use_id: p.itemId, input: { ...itemInput(it ?? { type: "fileChange", changes: [] }), description: p.reason ?? undefined }, permission_suggestions: [{ type: "codex", scope: "session" }] } });
    })();
    return;
  }
  if (method === "item/tool/requestUserInput") {
    const qs = (p.questions ?? []) as { id: string; header: string; question: string; options: { label: string; description: string }[] | null }[];
    s.approvals.set(reqId, { rpcId: id, kind: "input", questions: qs.map((q) => ({ id: q.id, question: q.question })) });
    emitLine(ctx, key, { type: "control_request", request_id: reqId, request: { subtype: "can_use_tool", tool_name: "AskUserQuestion", input: { questions: qs.map((q) => ({ question: q.question, header: q.header, options: q.options ?? [], multiSelect: false })) } } });
    return;
  }
  s.rpc.respondError(id, "Tidak didukung oleh Alexel Studio.");
}

/** Paket Codex membawa ripgrep di bin/<platform>/codex-path; tambahkan ke PATH seperti ekstensi VS Code. */
function codexEnv(bin: string) {
  const env = childEnv();
  const dir = path.dirname(bin);
  const extra = [path.join(dir, "codex-path"), dir].filter((d) => fs.existsSync(d));
  const k = Object.keys(env).find((x) => x.toUpperCase() === "PATH") ?? "PATH";
  env[k] = [...extra, env[k] ?? ""].join(path.delimiter);
  return env;
}

async function start(ctx: Ctx, key: string, cfg: Cfg): Promise<Session> {
  const f = findCodex(ctx);
  if (!f) throw new Error("Codex belum terpasang.");
  const cwd = cfg.cwd && fs.existsSync(cfg.cwd) ? cfg.cwd : os.homedir();
  const sp = spawnable(f.path, ["app-server"]);
  const child = spawn(sp.cmd, sp.args, { cwd, env: codexEnv(f.path), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
  const s = { child, cfg: { ...cfg, cwd }, threadId: null, turnId: null, defaultModel: null, contextWindow: null, items: new Map(), approvals: new Map(), started: Date.now(), lastUsage: null, error: null, stderr: "" } as unknown as Session;
  s.rpc = new LineRpc(child, { onNotify: (m, p) => onNotify(ctx, key, s, m, p), onRequest: (id, m, p) => onRequest(ctx, key, s, id, m, p) });
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
    await s.rpc.request("initialize", { clientInfo: { name: "alexel_studio", title: "Alexel Studio", version: "0.4.1" }, capabilities: null }, 30_000);
    s.rpc.notify("initialized");
    const list = await s.rpc.request<{ data?: any[] }>("model/list", {}, 30_000).catch(() => ({ data: [] })); // eslint-disable-line @typescript-eslint/no-explicit-any
    const models = (list.data ?? []).filter((m) => !m.hidden);
    s.defaultModel = models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? null;
    emitLine(ctx, key, {
      type: "control_response",
      response: {
        subtype: "success",
        request_id: `init-${key}`,
        response: {
          models: models.map((m) => ({ value: m.id, displayName: m.displayName ?? m.id, description: m.description ?? "", supportedEffortLevels: (m.supportedReasoningEfforts ?? []).map((e: { reasoningEffort: string }) => e.reasoningEffort) })),
          commands: [],
        },
      },
    });
    const pol = codexPolicy(cfg.mode);
    // Model dari config.toml pengguna bisa tidak didukung akunnya; pakai model bawaan katalog.
    const model = cfg.model ?? s.defaultModel ?? undefined;
    const res = cfg.resume
      ? await s.rpc.request<any>("thread/resume", { threadId: cfg.resume, cwd, model, approvalPolicy: pol.approvalPolicy, sandbox: pol.sandbox }, 60_000) // eslint-disable-line @typescript-eslint/no-explicit-any
      : await s.rpc.request<any>("thread/start", { cwd, model, approvalPolicy: pol.approvalPolicy, sandbox: pol.sandbox }, 60_000); // eslint-disable-line @typescript-eslint/no-explicit-any
    s.threadId = res.thread?.id ?? null;
    emitLine(ctx, key, { type: "system", subtype: "init", session_id: s.threadId, model: res.model ?? model ?? "codex" });
  })();
  s.ready.catch((e) => {
    s.stderr += String(e?.message ?? e);
    killTree(child);
  });
  return s;
}

function toInput(content: unknown) {
  const out: Record<string, unknown>[] = [];
  for (const b of (Array.isArray(content) ? content : [{ type: "text", text: String(content) }]) as { type: string; text?: string; source?: { media_type: string; data: string } }[]) {
    if (b.type === "text" && typeof b.text === "string") out.push({ type: "text", text: b.text, text_elements: [] });
    else if (b.type === "image" && b.source && /^image\/(png|jpeg|gif|webp)$/.test(b.source.media_type) && typeof b.source.data === "string") out.push({ type: "image", url: `data:${b.source.media_type};base64,${b.source.data}` });
  }
  if (!out.length) throw new Error("Pesan kosong.");
  if (Buffer.byteLength(JSON.stringify(out)) > 24 * 1024 * 1024) throw new Error("Pesan terlalu besar untuk dikirim (maks 24 MB).");
  return out;
}

export async function codexSend(ctx: Ctx, key: string, raw: Record<string, unknown>, content: unknown) {
  if (!validId(key)) throw new Error("Sesi tidak valid.");
  const input = toInput(content);
  const cfg = sanitize(raw);
  let s = sessions.get(key);
  if (s && s.cfg.cwd !== (cfg.cwd && fs.existsSync(cfg.cwd) ? cfg.cwd : os.homedir())) {
    codexClose(key);
    s = undefined;
  }
  if (!s) s = await start(ctx, key, cfg);
  else s.cfg = { ...s.cfg, model: cfg.model, effort: cfg.effort, mode: cfg.mode };
  await s.ready;
  if (!s.threadId) throw new Error("Codex tidak membuat percakapan.");
  s.started = Date.now();
  s.items.clear();
  const pol = codexPolicy(s.cfg.mode);
  const res = await s.rpc.request<any>("turn/start", { // eslint-disable-line @typescript-eslint/no-explicit-any
    threadId: s.threadId,
    input,
    model: s.cfg.model ?? s.defaultModel ?? undefined,
    effort: s.cfg.effort ?? undefined,
    approvalPolicy: pol.approvalPolicy,
    sandboxPolicy: sandboxPolicy(pol.sandbox, s.cfg.cwd),
  }, 60_000);
  s.turnId = res?.turn?.id ?? s.turnId;
}

export function codexControl(key: string, msg: unknown): boolean {
  const s = sessions.get(key);
  if (!s) return false;
  const m = msg as { type?: string; request?: { subtype?: string; mode?: string; model?: string }; response?: { request_id?: string; response?: { behavior?: string; updatedPermissions?: unknown[]; updatedInput?: { answers?: Record<string, string> } } } };
  if (m?.type === "control_response") {
    const a = s.approvals.get(String(m.response?.request_id ?? ""));
    if (!a) return false;
    s.approvals.delete(String(m.response?.request_id));
    const r = m.response?.response ?? {};
    if (a.kind === "input") {
      const answers: Record<string, { answers: string[] }> = {};
      for (const q of a.questions ?? []) {
        const v = r.updatedInput?.answers?.[q.question];
        if (v) answers[q.id] = { answers: String(v).split(", ").filter(Boolean) };
      }
      s.rpc.respond(a.rpcId, { answers });
    } else {
      const decision = r.behavior !== "allow" ? "decline" : Array.isArray(r.updatedPermissions) && r.updatedPermissions.length ? "acceptForSession" : "accept";
      s.rpc.respond(a.rpcId, { decision });
    }
    return true;
  }
  if (m?.type === "control_request") {
    const sub = m.request?.subtype;
    if (sub === "interrupt") {
      if (s.threadId && s.turnId) void s.rpc.request("turn/interrupt", { threadId: s.threadId, turnId: s.turnId }, 15_000).catch(() => {});
      return true;
    }
    if (sub === "set_model") {
      s.cfg.model = validModel(m.request?.model) ? m.request!.model! : null;
      return true;
    }
    if (sub === "set_permission_mode") {
      s.cfg.mode = String(m.request?.mode ?? "untrusted");
      return true;
    }
  }
  return false;
}

export function codexClose(key: string) {
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

export function killAllCodex() {
  for (const s of sessions.values()) killTree(s.child);
  sessions.clear();
}

// ---------------- Riwayat (thread/list, thread/read) ----------------

async function withServer<T>(ctx: Ctx, fn: (rpc: LineRpc) => Promise<T>, onNotify: (method: string, params: any) => void = () => {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const f = findCodex(ctx);
  if (!f) throw new Error("Codex belum terpasang.");
  const sp = spawnable(f.path, ["app-server"]);
  const child = spawn(sp.cmd, sp.args, { cwd: os.homedir(), env: childEnv(), stdio: ["pipe", "pipe", "ignore"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
  // Permintaan izin dari proses sekali pakai (baca saja) selalu ditolak.
  const rpc = new LineRpc(child, {
    onNotify,
    onRequest: (id, method) => (/requestApproval|Approval$/.test(method) ? rpc.respond(id, { decision: "decline" }) : rpc.respondError(id, "Tidak didukung.")),
  });
  try {
    await rpc.request("initialize", { clientInfo: { name: "alexel_studio", title: "Alexel Studio", version: "0.4.1" }, capabilities: null }, 30_000);
    rpc.notify("initialized");
    return await fn(rpc);
  } finally {
    killTree(child);
  }
}

const onceRuns = new Map<string, () => void>();

/** Satu permintaan tanpa percakapan (mis. pesan commit): sandbox baca saja, hasil = teks jawaban terakhir. */
export async function codexOnce(ctx: Ctx, runId: string, cwd: string, prompt: string): Promise<string> {
  const dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  let text = "";
  let done: ((v: string) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;
  const finished = new Promise<string>((res, rej) => {
    done = res;
    fail = rej;
  });
  return withServer(
    ctx,
    async (rpc) => {
      onceRuns.set(runId, () => fail?.(new Error("Dibatalkan.")));
      const timer = setTimeout(() => fail?.(new Error("Codex tidak menjawab dalam 3 menit.")), 180_000);
      try {
        const list = await rpc.request<{ data?: any[] }>("model/list", {}, 30_000).catch(() => ({ data: [] })); // eslint-disable-line @typescript-eslint/no-explicit-any
        const models = (list.data ?? []).filter((m) => !m.hidden);
        const model = models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? undefined;
        const t = await rpc.request<any>("thread/start", { cwd: dir, model, approvalPolicy: "on-request", sandbox: "read-only" }, 60_000); // eslint-disable-line @typescript-eslint/no-explicit-any
        await rpc.request("turn/start", { threadId: t.thread?.id, input: [{ type: "text", text: prompt, text_elements: [] }], model, effort: "low", approvalPolicy: "on-request", sandboxPolicy: sandboxPolicy("read-only", dir) }, 60_000);
        return await finished;
      } finally {
        clearTimeout(timer);
        onceRuns.delete(runId);
      }
    },
    (method, p) => {
      if (method === "item/completed" && p?.item?.type === "agentMessage" && p.item.text) text = p.item.text;
      else if (method === "turn/completed") {
        if (p?.turn?.status === "failed") fail?.(new Error(parseError(p.turn.error?.message) ?? "Codex berhenti dengan error."));
        else done?.(text);
      }
    }
  );
}

export function codexOnceCancel(runId: string): boolean {
  const c = onceRuns.get(runId);
  c?.();
  return !!c;
}

export async function codexSessions(ctx: Ctx, cwd: string) {
  return withServer(ctx, async (rpc) => {
    const r = await rpc.request<{ data?: any[] }>("thread/list", { cwd, limit: 60 }, 30_000); // eslint-disable-line @typescript-eslint/no-explicit-any
    return (r.data ?? []).filter((t) => !t.parentThreadId).map((t) => ({ id: t.id, title: (t.name || t.preview || "Percakapan tanpa judul").replace(/\s+/g, " ").slice(0, 120), time_ms: (t.updatedAt ?? t.createdAt ?? 0) * 1000, messages: 0 }));
  });
}

/** Isi thread lama sebagai baris user/assistant (format Claude) untuk ditampilkan ulang. */
export async function codexSessionLoad(ctx: Ctx, _cwd: string, id: string): Promise<string[]> {
  if (!validId(id)) throw new Error("Sesi tidak valid.");
  return withServer(ctx, async (rpc) => {
    const r = await rpc.request<{ thread?: { turns?: { items?: any[] }[] } }>("thread/read", { threadId: id, includeTurns: true }, 30_000); // eslint-disable-line @typescript-eslint/no-explicit-any
    const out: string[] = [];
    for (const t of r.thread?.turns ?? [])
      for (const it of t.items ?? []) {
        if (it.type === "userMessage") {
          const text = (it.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
          if (text) out.push(JSON.stringify({ type: "user", message: { role: "user", content: text } }));
        } else if (it.type === "agentMessage" && it.text) out.push(JSON.stringify({ type: "assistant", message: { id: it.id, content: [{ type: "text", text: it.text }] } }));
        else if (TOOL_NAME[it.type]) {
          out.push(JSON.stringify({ type: "assistant", message: { id: `t-${it.id}`, content: [{ type: "tool_use", id: it.id, name: TOOL_NAME[it.type], input: itemInput(it) }] } }));
          out.push(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: it.id, content: it.aggregatedOutput ?? "", is_error: it.status === "failed" || it.status === "declined" }] } }));
        }
      }
    return out.slice(-600);
  });
}
