// Antigravity (Google) lewat CLI `agy` mode print + stream-json (NDJSON di stdin/stdout).
// agy headless tidak bisa meminta izin ke editor: izin diatur lewat mode (accept-edits / plan),
// dan aksi yang ditolak dilaporkan di hasil. Event diterjemahkan ke format chat panel.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { childEnv, findExecutable, killTree, runCapture, spawnable, type Ctx } from "../util";
import type { AgentStatus } from "./index";

export function findAgy(): string | null {
  const local = path.join(os.homedir(), ".gemini", "bin", process.platform === "win32" ? "agy.exe" : "agy");
  return fs.existsSync(local) ? local : findExecutable("agy");
}

/**
 * Teks yang menandakan agy belum masuk (OAuth interaktif diperlukan). Tidak ada perintah `agy status`;
 * pesan ini berasal dari mode print (stderr/stdout) saat silent auth gagal.
 */
export const AUTH_RE = /not authenticated|authentication (required|expired|failed)|not logged in|log(?:ged)? ?in (required|first)|please (log ?in|sign ?in)|interactive (oauth|login)|no controlling terminal|open the following url|enter the authorization code|verify your account|silent auth failed/i;
export const isAuthText = (t: string) => AUTH_RE.test(t);

/** Run headless terakhir gagal karena belum masuk. Dihapus saat `agy models` berhasil lagi. */
let authFailed = false;
let lastModels: { value: string; displayName: string }[] = [];

function parseModels(out: string): { value: string; displayName: string }[] {
  return out
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((p) => p.length >= 2 && /^[\w.-]+$/.test(p[0].trim()))
    .map(([id, name]) => ({ value: id.trim(), displayName: name.trim() }));
}

/**
 * Status Antigravity tanpa pernah memicu OAuth: `agy --version`, lalu `agy models` (memakai token keyring;
 * keluaran daftar model = sudah masuk, teks auth = belum masuk, lainnya = tidak diketahui).
 */
export async function agyStatus(): Promise<AgentStatus> {
  return agyStatusFor(findAgy());
}

export async function agyStatusFor(p: string | null): Promise<AgentStatus> {
  if (!p) return { installed: false, error: null };
  const v = await runCapture(p, ["--version"], { timeoutMs: 10_000 }).catch(() => null);
  if (v && !v.success && !v.timedOut) return { installed: false, path: p, source: "system", error: `Antigravity ditemukan tapi gagal jalan${v.stderr ? `: ${v.stderr.trim().slice(0, 200)}` : "."}` };
  const version = v?.success ? v.stdout.trim().split("\n").pop() ?? null : null;
  const m = await runCapture(p, ["models"], { timeoutMs: 30_000 }).catch(() => null);
  let loggedIn: boolean | null = null;
  if (m?.success) {
    const models = parseModels(m.stdout);
    if (models.length) {
      lastModels = models;
      authFailed = false;
      loggedIn = true;
    }
  } else if (m && !m.timedOut && (isAuthText(`${m.stdout}\n${m.stderr}`) || authFailed)) {
    loggedIn = false;
  } else if (authFailed) {
    loggedIn = false;
  }
  return { installed: true, path: p, version, loggedIn, source: "system", error: null };
}

/** Daftar model dari `agy models` (id<TAB>nama). */
export async function agyModels(bin: string): Promise<{ value: string; displayName: string }[]> {
  const r = await runCapture(bin, ["models"], { timeoutMs: 30_000 }).catch(() => null);
  if (!r?.success) return [];
  const models = parseModels(r.stdout);
  if (models.length) lastModels = models;
  return models;
}

const TOOL: Record<string, string> = { write_to_file: "Write", replace_file_content: "Edit", multi_replace_file_content: "Edit", run_command: "Bash", view_file: "Read", list_dir: "Glob", grep_search: "Grep", find_by_name: "Glob", read_url_content: "WebFetch", search_web: "WebSearch" };

/** Parameter alat agy → input kartu alat. */
export function agyInput(params: Record<string, unknown> | undefined): Record<string, unknown> {
  const p = params ?? {};
  const out: Record<string, unknown> = {};
  const file = p.TargetFile ?? p.AbsolutePath ?? p.File ?? p.SearchPath ?? p.DirectoryPath;
  if (typeof file === "string") out.file_path = file;
  if (typeof p.CommandLine === "string") out.command = p.CommandLine;
  if (typeof p.Query === "string") out.query = p.Query;
  if (typeof p.Url === "string") out.url = p.Url;
  return out;
}

interface Cfg {
  cwd: string;
  model: string | null;
  effort: string | null;
  mode: string;
  resume: string | null;
}

interface Session {
  child: ChildProcess;
  cfg: Cfg;
  conversation: string | null;
  stderr: string;
  /** Teks yang sedang mengalir per langkah. */
  texts: Map<string, string>;
}

const sessions = new Map<string, Session>();
/** Percakapan dari proses yang dihentikan lewat Stop; dilanjutkan pada pesan berikutnya. */
const stoppedConversations = new Map<string, string>();
const emitLine = (ctx: Ctx, key: string, obj: unknown) => ctx.emit("agent-event", { run_id: key, line: JSON.stringify(obj) });
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

function sanitize(raw: Record<string, unknown>): Cfg {
  return {
    cwd: typeof raw.cwd === "string" ? raw.cwd : "",
    model: typeof raw.model === "string" && /^[\w.-]{1,80}$/.test(raw.model) && raw.model !== "default" ? raw.model : null,
    effort: typeof raw.effort === "string" && EFFORTS.includes(raw.effort) ? raw.effort : null,
    mode: raw.mode === "plan" || raw.mode === "strict" ? raw.mode : "accept-edits",
    resume: typeof raw.resume === "string" && /^[A-Za-z0-9-]{1,80}$/.test(raw.resume) ? raw.resume : null,
  };
}

export function agyArgs(cfg: Cfg): string[] {
  const a = ["--input-format", "stream-json", "--output-format", "stream-json"];
  if (cfg.mode !== "strict") a.push("--mode", cfg.mode);
  if (cfg.model) a.push("--model", cfg.model);
  if (cfg.effort) a.push("--effort", cfg.effort);
  if (cfg.resume) a.push("--conversation", cfg.resume);
  // Mode print tanpa prompt awal: setiap baris stdin satu giliran.
  a.push("--print=");
  return a;
}

function onEvent(ctx: Ctx, key: string, s: Session, ev: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (ev.event === "init") {
    s.conversation = ev.conversation_id ?? s.conversation;
    emitLine(ctx, key, { type: "system", subtype: "init", session_id: s.conversation, model: s.cfg.model ?? "antigravity" });
    return;
  }
  if (ev.event === "step_update") {
    const u = ev.step_update ?? {};
    const id = `agy-${s.conversation}-${u.step_index}`;
    if (u.step_type === "agent_response") {
      // Potongan teks per langkah: alirkan, lalu kirim teks utuh saat langkah selesai.
      if (u.text_delta) {
        if (!s.texts.has(id)) {
          s.texts.set(id, "");
          emitLine(ctx, key, { type: "stream_event", event: { type: "message_start", message: { id } } });
        }
        s.texts.set(id, s.texts.get(id) + String(u.text_delta));
        emitLine(ctx, key, { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: String(u.text_delta) } } });
      }
      if (u.state === "DONE" && s.texts.get(id)) {
        emitLine(ctx, key, { type: "assistant", message: { id, content: [{ type: "text", text: s.texts.get(id)!.replace(/\n$/, "") }] } });
        s.texts.delete(id);
      }
    } else if (u.step_type === "tool") {
      const name = TOOL[u.tool_name] ?? u.tool_name ?? "Alat";
      if (u.state === "ACTIVE") emitLine(ctx, key, { type: "assistant", message: { id: `t-${id}`, content: [{ type: "tool_use", id, name, input: agyInput(u.tool_info?.parameters) }] } });
      else if (u.state === "DONE" || u.state === "ERROR") {
        emitLine(ctx, key, { type: "assistant", message: { id: `t-${id}`, content: [{ type: "tool_use", id, name, input: agyInput(u.tool_info?.parameters) }] } });
        emitLine(ctx, key, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: String(u.tool_info?.error ?? u.error ?? ""), is_error: u.state === "ERROR" }] } });
      }
    }
    return;
  }
  if (ev.event === "result") {
    const r = ev.result ?? {};
    const denied = (r.denied_actions ?? []) as { action: string; display_name?: string }[];
    if (denied.length)
      emitLine(ctx, key, {
        type: "user",
        message: { content: `<local-command-stdout>Antigravity tidak bisa meminta izin dari editor, jadi aksi ini ditolak: ${denied.map((d) => d.display_name ?? d.action).join(", ")}. Pilih mode "Edit otomatis", atau izinkan di pengaturan Antigravity.</local-command-stdout>` },
      });
    const ok = r.status === "SUCCESS";
    emitLine(ctx, key, {
      type: "result",
      subtype: ok ? "success" : "error_during_execution",
      is_error: !ok,
      result: ok ? "" : r.error || "Antigravity berhenti dengan error.",
      session_id: r.conversation_id ?? s.conversation,
      duration_ms: Math.round((r.duration_seconds ?? 0) * 1000),
      num_turns: r.num_turns,
    });
    if (r.usage) emitLine(ctx, key, { type: "stream_event", event: { type: "message_start", message: { id: `u-${Date.now()}`, usage: { input_tokens: r.usage.input_tokens ?? 0 } } } });
  }
}

function start(ctx: Ctx, key: string, cfg: Cfg): Session {
  const bin = findAgy();
  if (!bin) throw new Error("Antigravity belum terpasang.");
  const cwd = cfg.cwd && fs.existsSync(cfg.cwd) ? cfg.cwd : os.homedir();
  const sp = spawnable(bin, agyArgs(cfg));
  const child = spawn(sp.cmd, sp.args, { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
  const s: Session = { child, cfg: { ...cfg, cwd }, conversation: cfg.resume, stderr: "", texts: new Map() };
  sessions.set(key, s);
  // Belum masuk: agy mencoba OAuth interaktif yang tidak bisa selesai tanpa terminal dan menunggu selamanya.
  // Hentikan prosesnya dan laporkan error yang jelas supaya panel menampilkan tombol Masuk.
  let authReported = false;
  const authWall = (text: string) => {
    if (authReported || !isAuthText(text)) return;
    authReported = true;
    authFailed = true;
    emitLine(ctx, key, { type: "result", subtype: "error_during_execution", is_error: true, result: "Antigravity: authentication required. Masuk dulu dengan akun Google (klik Masuk di panel).", session_id: s.conversation });
    killTree(child);
  };
  readline.createInterface({ input: child.stdout! }).on("line", (line) => {
    try {
      onEvent(ctx, key, s, JSON.parse(line));
    } catch {
      authWall(line); // baris bukan JSON: log / pesan auth
    }
  });
  child.stderr?.on("data", (b: Buffer) => {
    const t = b.toString("utf8");
    if (s.stderr.length < 8000) s.stderr += t;
    authWall(t);
  });
  child.stdin?.on("error", () => {});
  child.on("error", (e) => (s.stderr += e.message));
  child.on("close", (code, signal) => {
    if (sessions.get(key) === s) sessions.delete(key);
    ctx.emit("agent-done", { run_id: key, code: signal ? 130 : code, stderr: s.stderr.slice(0, 4000), replaced: sessions.has(key) });
  });
  return s;
}

export async function agySend(ctx: Ctx, key: string, raw: Record<string, unknown>, content: unknown) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(key)) throw new Error("Sesi tidak valid.");
  const text = (Array.isArray(content) ? content : [{ type: "text", text: String(content) }])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text?: string }) => b.text ?? "")
    .join("\n");
  if (!text.trim()) throw new Error("Antigravity belum menerima gambar; tulis pesan teks.");
  const cfg = sanitize(raw);
  let s = sessions.get(key);
  // Model / effort / mode / folder berubah: mulai ulang proses dan lanjutkan percakapan yang sama.
  if (s && (s.cfg.model !== cfg.model || s.cfg.effort !== cfg.effort || s.cfg.mode !== cfg.mode || s.cfg.cwd !== (cfg.cwd && fs.existsSync(cfg.cwd) ? cfg.cwd : os.homedir()))) {
    const conv = s.conversation;
    agyClose(key);
    cfg.resume = conv ?? cfg.resume;
    s = undefined;
  }
  if (!s) {
    const stopped = stoppedConversations.get(key);
    stoppedConversations.delete(key);
    if (!cfg.resume && stopped) cfg.resume = stopped;
    s = start(ctx, key, cfg);
    // Daftar model dari status terakhir; hanya menjalankan `agy models` lagi bila belum ada dan belum ada tanda gagal masuk.
    const emitModels = (models: { value: string; displayName: string }[]) =>
      emitLine(ctx, key, { type: "control_response", response: { subtype: "success", request_id: `init-${key}`, response: { models, commands: [] } } });
    if (lastModels.length) emitModels(lastModels);
    else if (!authFailed) void agyModels(findAgy()!).then(emitModels);
  }
  s.child.stdin?.write(JSON.stringify({ event: "user", message: { content: text } }) + "\n");
}

export function agyControl(key: string, msg: unknown): boolean {
  const s = sessions.get(key);
  if (!s) return false;
  const m = msg as { type?: string; request?: { subtype?: string } };
  if (m?.type === "control_request" && m.request?.subtype === "interrupt") {
    // agy tidak punya perintah interrupt: hentikan proses; percakapan dilanjutkan di proses berikutnya.
    // Sesi langsung dilepas supaya pesan yang dikirim sebelum proses benar-benar mati tidak hilang.
    sessions.delete(key);
    if (s.conversation) stoppedConversations.set(key, s.conversation);
    killTree(s.child);
    return true;
  }
  return false;
}

export function agyClose(key: string) {
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

export function killAllAgy() {
  for (const s of sessions.values()) killTree(s.child);
  sessions.clear();
}
