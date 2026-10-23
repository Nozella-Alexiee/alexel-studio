// Jembatan ke Claude Code CLI resmi (langganan Pro/Max, tanpa API key).
// Prompt lewat stdin; output stream-json diteruskan baris per baris sebagai `agent-event`.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { childEnv, findExecutable, killTree, runCapture, spawnable, type Ctx } from "./util";

const MAX_PROMPT_BYTES = 400 * 1024;
const runs = new Map<string, ChildProcess>();

/** Biner Claude dari panel Ekstensi (dipasang dari Open VSX); diutamakan bila ada. */
let preferred: string | null = null;
export function setPreferredClaude(p: string | null) {
  preferred = p && fs.existsSync(p) ? p : null;
}

export function findClaude(): string | null {
  if (preferred) return preferred;
  // Penginstal native menaruh claude(.exe) di ~/.local/bin; npm memasang shim claude(.cmd).
  const home = os.homedir();
  return findExecutable("claude", [path.join(home, ".local", "bin"), path.join(home, ".claude", "local")]) ?? bundledWithDesktop();
}

function spawnCli(cli: string, args: string[], cwd: string) {
  const sp = spawnable(cli, args);
  return spawn(sp.cmd, sp.args, { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim });
}

/** Claude Code yang dibundel aplikasi Claude desktop (macOS); pilih versi terbaru. */
function bundledWithDesktop(): string | null {
  if (process.platform !== "darwin") return null;
  const base = path.join(os.homedir(), "Library/Application Support/Claude/claude-code");
  const found: { p: string; t: number }[] = [];
  try {
    for (const ver of fs.readdirSync(base)) {
      for (const h of fs.readdirSync(path.join(base, ver))) {
        const p = path.join(base, ver, h, "claude.app/Contents/MacOS/claude");
        if (fs.existsSync(p)) found.push({ p, t: fs.statSync(p).mtimeMs });
      }
    }
  } catch {
    return null;
  }
  found.sort((a, b) => b.t - a.t);
  return found[0]?.p ?? null;
}

export async function claudeDetect() {
  const p = findClaude();
  if (!p) return { installed: false, path: null, version: null, error: "Claude Code CLI belum terpasang. Pasang: npm install -g @anthropic-ai/claude-code" };
  try {
    const r = await runCapture(p, ["--version"], { timeoutMs: 10_000 });
    if (r.success) {
      // Status login (tanpa email): supaya panel bisa menawarkan tombol "Masuk" sebelum pengguna mengirim pesan.
      let loggedIn: boolean | null = null;
      let plan: string | null = null;
      try {
        const a = await runCapture(p, ["auth", "status", "--json"], { timeoutMs: 10_000 });
        const j = JSON.parse(a.stdout.trim() || "{}") as { loggedIn?: boolean; subscriptionType?: string };
        if (typeof j.loggedIn === "boolean") loggedIn = j.loggedIn;
        if (typeof j.subscriptionType === "string") plan = j.subscriptionType;
      } catch {
        /* versi CLI lama tanpa `auth status` */
      }
      const choices = await cliChoices(p);
      return { installed: true, path: p, version: r.stdout.trim(), error: null, loggedIn, plan, permissionModes: choices.permissionModes, efforts: choices.efforts };
    }
    return { installed: false, path: p, version: null, error: `claude ditemukan tapi gagal jalan: ${r.timedOut ? "timeout" : r.stderr.trim()}` };
  } catch (e) {
    return { installed: false, path: p, version: null, error: (e as Error).message };
  }
}

/**
 * Mode izin yang bisa dipilih di panel:
 * "default" = tanya dulu sebelum mengedit atau menjalankan perintah (kartu izin di panel),
 * "acceptEdits" = edit berkas langsung, perintah lain tetap ditanyakan,
 * "plan" = hanya membaca dan menyusun rencana.
 */
export type PermMode = "default" | "acceptEdits" | "plan" | "auto" | "bypassPermissions";
export const PERM_MODES: PermMode[] = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export interface SessionCfg {
  cwd: string;
  /** Alias ("opus", "sonnet", "haiku", "fable") atau nama model lengkap; kosong = bawaan akun. */
  model?: string | null;
  /** "low" … "max"; kosong = bawaan model. */
  effort?: string | null;
  mode: PermMode;
  /** session_id Claude Code untuk dilanjutkan. */
  resume?: string | null;
  /** Ultracode (saklar sesi di bawah Effort): `apply_flag_settings {ultracode}`. */
  ultracode?: boolean;
  /** Pengguna mengizinkan mode berbahaya (bypassPermissions) di Pengaturan; tanpa ini mode itu ditolak. */
  allowDangerous?: boolean;
  /** Mode cepat (fastMode): respons lebih cepat bila akun/model mendukung. */
  fast?: boolean;
  /** false = matikan thinking (alwaysThinkingEnabled); selain itu bawaan CLI. */
  thinking?: boolean;
}

interface Live {
  child: ChildProcess;
  cfg: SessionCfg;
  seq: number;
}
/** Satu proses CLI per percakapan, tetap hidup di antara giliran (stdin stream-json). */
const sessions = new Map<string, Live>();

const MAX_CONTENT_BYTES = 24 * 1024 * 1024;
const validId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9-]{1,80}$/.test(s);
const validModel = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9._[\]-]{1,80}$/.test(s) && s !== "default";

export function sanitizeCfg(raw: Partial<SessionCfg> | undefined): SessionCfg {
  const r = raw ?? {};
  const allowDangerous = r.allowDangerous === true;
  let mode: PermMode = PERM_MODES.includes(r.mode as PermMode) ? (r.mode as PermMode) : "default";
  // Mode berbahaya hanya bila diizinkan di Pengaturan, dan tidak pernah sebagai mode awal proses.
  if (mode === "bypassPermissions" && !allowDangerous) mode = "default";
  return {
    cwd: typeof r.cwd === "string" ? r.cwd : "",
    model: validModel(r.model) ? r.model : null,
    effort: typeof r.effort === "string" && EFFORTS.includes(r.effort) ? r.effort : null,
    mode,
    resume: validId(r.resume) ? r.resume : null,
    ultracode: r.ultracode === true,
    allowDangerous,
    fast: r.fast === true,
    thinking: r.thinking === false ? false : undefined,
  };
}

/**
 * Pilihan yang diterima CLI, dibaca dari `claude --help`. Nilai tak valid untuk --permission-mode
 * membuat proses keluar sebelum pesan pertama, jadi panel hanya menawarkan yang tercantum di sini.
 */
export function parseCliHelp(text: string): { permissionModes: string[]; efforts: string[] } {
  const t = text.replace(/\s+/g, " ");
  const list = (m: RegExpExecArray | null) => (m ? m[1].split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean) : []);
  return {
    permissionModes: list(/--permission-mode <mode>.*?\(choices: ([^)]*)\)/.exec(t)),
    efforts: list(/--effort <level>.*?\(([^)]*)\)/.exec(t)),
  };
}

const helpCache = new Map<string, { permissionModes: string[]; efforts: string[] }>();
async function cliChoices(cli: string) {
  const hit = helpCache.get(cli);
  if (hit) return hit;
  const r = await runCapture(cli, ["--help"], { timeoutMs: 15_000 }).catch(() => null);
  const parsed = parseCliHelp(`${r?.stdout ?? ""}\n${r?.stderr ?? ""}`);
  if (parsed.permissionModes.length || parsed.efforts.length) helpCache.set(cli, parsed);
  return parsed;
}

/** Argumen CLI untuk sesi stream-json; permintaan izin dijawab pengguna lewat panel. */
export function sessionArgs(cfg: SessionCfg): string[] {
  const args = [
    "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--permission-prompts", "host", "--permission-prompt-tool", "stdio",
    "--permission-mode", cfg.mode,
  ];
  if (cfg.allowDangerous) args.push("--allow-dangerously-skip-permissions");
  if (cfg.model) args.push("--model", cfg.model);
  if (cfg.effort) args.push("--effort", cfg.effort);
  if (cfg.resume) args.push("--resume", cfg.resume);
  return args;
}

function writeLine(live: Live, obj: unknown) {
  if (live.child.stdin && !live.child.stdin.destroyed) live.child.stdin.write(JSON.stringify(obj) + "\n");
}

function startSession(ctx: Ctx, key: string, cfg: SessionCfg): Live {
  const cli = findClaude();
  if (!cli) throw new Error("Claude Code CLI belum terpasang.");
  const cwd = cfg.cwd && fs.existsSync(cfg.cwd) ? cfg.cwd : os.homedir();
  const child = spawnCli(cli, sessionArgs(cfg), cwd);
  const live: Live = { child, cfg, seq: 0 };
  sessions.set(key, live);
  let stderr = "";
  child.stderr?.on("data", (b: Buffer) => {
    if (stderr.length < 8000) stderr += b.toString("utf8");
  });
  const rl = readline.createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    if (line.trim()) ctx.emit("agent-event", { run_id: key, line });
  });
  let done = false;
  const finish = (code: number | null) => {
    if (done) return;
    done = true;
    if (sessions.get(key) === live) sessions.delete(key);
    // replaced: proses baru dengan kunci yang sama sudah berjalan (effort/folder diganti).
    ctx.emit("agent-done", { run_id: key, code, stderr: stderr.slice(0, 4000), replaced: sessions.has(key) });
  };
  child.on("error", (e) => {
    stderr += e.message;
    finish(null);
  });
  child.on("close", (code, signal) => finish(signal ? 130 : code));
  child.stdin?.on("error", () => {});
  // initialize: CLI membalas daftar model, akun, dan slash command (diteruskan ke renderer).
  writeLine(live, { type: "control_request", request_id: `init-${key}`, request: { subtype: "initialize" } });
  // get_settings melaporkan apakah Ultracode tersedia untuk akun/model ini (`applied.ultracodeAvailable`).
  writeLine(live, { type: "control_request", request_id: `settings-${key}`, request: { subtype: "get_settings" } });
  if (cfg.ultracode) writeLine(live, { type: "control_request", request_id: `u-${key}-${++live.seq}`, request: { subtype: "apply_flag_settings", settings: { ultracode: true } } });
  // Mode cepat butuh opt-in eksplisit dari host SDK (fastMode di flag settings); thinking dimatikan hanya bila diminta.
  const flags: Record<string, unknown> = {};
  if (cfg.fast) flags.fastMode = true;
  if (cfg.thinking === false) flags.alwaysThinkingEnabled = false;
  if (Object.keys(flags).length) writeLine(live, { type: "control_request", request_id: `f-${key}-${++live.seq}`, request: { subtype: "apply_flag_settings", settings: flags } });
  return live;
}

/**
 * Kirim satu pesan pengguna. Proses dibuat bila belum ada; model & mode izin diganti langsung
 * lewat control request, sedangkan folder/effort yang berubah memulai ulang proses (sesi dilanjutkan).
 */
export function claudeSessionSend(ctx: Ctx, key: string, rawCfg: Partial<SessionCfg>, content: unknown) {
  if (!validId(key)) throw new Error("Sesi tidak valid.");
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
  if (!Array.isArray(blocks) || !blocks.length) throw new Error("Pesan kosong.");
  for (const b of blocks as { type?: string; text?: unknown; source?: { type?: string; media_type?: string; data?: unknown } }[]) {
    const okText = b?.type === "text" && typeof b.text === "string";
    const okImage = b?.type === "image" && b.source?.type === "base64" && /^image\/(png|jpeg|gif|webp)$/.test(b.source.media_type ?? "") && typeof b.source.data === "string";
    if (!okText && !okImage) throw new Error("Isi pesan tidak didukung.");
  }
  if (Buffer.byteLength(JSON.stringify(blocks)) > MAX_CONTENT_BYTES) throw new Error("Pesan terlalu besar untuk dikirim (maks 24 MB).");
  const cfg = sanitizeCfg(rawCfg);
  let live = sessions.get(key);
  // Folder atau izin mode berbahaya berubah: proses harus dimulai ulang (flag peluncuran). Effort & Ultracode
  // diterapkan langsung lewat apply_flag_settings, tanpa mengganggu percakapan.
  if (live && (live.cfg.cwd !== cfg.cwd || !!live.cfg.allowDangerous !== !!cfg.allowDangerous)) {
    claudeSessionClose(key);
    live = undefined;
  }
  if (!live) live = startSession(ctx, key, cfg);
  else {
    if ((live.cfg.effort ?? null) !== (cfg.effort ?? null)) writeLine(live, { type: "control_request", request_id: `e-${key}-${++live.seq}`, request: { subtype: "apply_flag_settings", settings: { effortLevel: cfg.effort ?? null } } });
    if (!!live.cfg.ultracode !== !!cfg.ultracode) writeLine(live, { type: "control_request", request_id: `u-${key}-${++live.seq}`, request: { subtype: "apply_flag_settings", settings: { ultracode: cfg.ultracode ? true : null } } });
    if ((live.cfg.model ?? null) !== (cfg.model ?? null)) writeLine(live, { type: "control_request", request_id: `m-${key}-${++live.seq}`, request: { subtype: "set_model", model: cfg.model ?? "default" } });
    if (live.cfg.mode !== cfg.mode) writeLine(live, { type: "control_request", request_id: `p-${key}-${++live.seq}`, request: { subtype: "set_permission_mode", mode: cfg.mode } });
    live.cfg = { ...cfg, resume: live.cfg.resume };
  }
  writeLine(live, { type: "user", message: { role: "user", content: blocks }, parent_tool_use_id: null, session_id: "" });
}

/**
 * Mulai proses CLI tanpa mengirim pesan: initialize membalas daftar model, kemampuan (Ultracode, auto) dan
 * slash command, jadi pemilih di panel langsung akurat sebelum pesan pertama. Tidak memanggil API apa pun.
 */
export function claudeSessionWarm(ctx: Ctx, key: string, rawCfg: Partial<SessionCfg>) {
  if (!validId(key)) throw new Error("Sesi tidak valid.");
  if (sessions.has(key)) return;
  startSession(ctx, key, sanitizeCfg(rawCfg));
}

/**
 * Pesan kontrol dari renderer ke CLI: jawaban izin (control_response) atau interrupt /
 * set_model / set_permission_mode (control_request). Mengembalikan false bila sesi tidak hidup.
 */
export function claudeSessionControl(key: string, msg: unknown): boolean {
  const live = sessions.get(key);
  if (!live) return false;
  const m = msg as { type?: string; request_id?: string; request?: { subtype?: string; mode?: string; model?: string; settings?: Record<string, unknown> }; response?: { request_id?: string } };
  if (m?.type === "control_response") {
    if (typeof m.response?.request_id !== "string") throw new Error("Jawaban izin tidak valid.");
  } else if (m?.type === "control_request") {
    const sub = m.request?.subtype;
    if (sub === "set_permission_mode") {
      if (!PERM_MODES.includes(m.request?.mode as PermMode)) throw new Error("Mode izin tidak valid.");
      if (m.request?.mode === "bypassPermissions" && !live.cfg.allowDangerous) throw new Error("Mode berbahaya belum diizinkan di Pengaturan.");
      live.cfg.mode = m.request!.mode as PermMode;
    } else if (sub === "apply_flag_settings") {
      // Hanya dua kunci, dibangun ulang dari nol: renderer tidak boleh menyuntikkan hooks/env/izin ke CLI.
      const s = m.request?.settings ?? {};
      const clean: Record<string, unknown> = {};
      if ("ultracode" in s) clean.ultracode = s.ultracode === true ? true : null;
      if ("effortLevel" in s) clean.effortLevel = typeof s.effortLevel === "string" && EFFORTS.includes(s.effortLevel) ? s.effortLevel : null;
      if ("fastMode" in s) clean.fastMode = s.fastMode === true ? true : null;
      if ("alwaysThinkingEnabled" in s) clean.alwaysThinkingEnabled = typeof s.alwaysThinkingEnabled === "boolean" ? s.alwaysThinkingEnabled : null;
      if (!Object.keys(clean).length) throw new Error("Pengaturan tidak didukung.");
      m.request = { subtype: "apply_flag_settings", settings: clean };
      if ("ultracode" in clean) live.cfg.ultracode = clean.ultracode === true;
      if ("effortLevel" in clean) live.cfg.effort = (clean.effortLevel as string | null) ?? null;
      if ("fastMode" in clean) live.cfg.fast = clean.fastMode === true;
      if ("alwaysThinkingEnabled" in clean) live.cfg.thinking = clean.alwaysThinkingEnabled === false ? false : undefined;
    } else if (sub === "get_settings") {
      /* hanya baca */
    } else if (sub === "set_model") {
      if (m.request?.model !== "default" && !validModel(m.request?.model)) throw new Error("Model tidak valid.");
      live.cfg.model = m.request?.model === "default" ? null : (m.request?.model ?? null);
    } else if (sub !== "interrupt") throw new Error("Permintaan kontrol tidak didukung.");
    m.request_id ??= `c-${key}-${++live.seq}`;
  } else throw new Error("Pesan kontrol tidak valid.");
  writeLine(live, m);
  return true;
}

/** Tutup proses sesi (stdin ditutup, lalu dimatikan bila belum keluar). */
export function claudeSessionClose(key: string) {
  const live = sessions.get(key);
  if (!live) return;
  sessions.delete(key);
  try {
    live.child.stdin?.end();
  } catch {
    /* sudah tertutup */
  }
  const t = setTimeout(() => killTree(live.child), 1500);
  live.child.once("close", () => clearTimeout(t));
}

// ---------------- Riwayat sesi (~/.claude/projects) ----------------

const configDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

/** Folder sesi Claude Code sebuah project: path dengan semua karakter non-alfanumerik jadi "-". */
export function projectSessionDirs(cwd: string, base = path.join(configDir(), "projects")): string[] {
  const enc = cwd.replace(/[^A-Za-z0-9]/g, "-");
  let names: string[] = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    return [];
  }
  // Path panjang dipotong dan diberi akhiran hash oleh CLI; cocokkan awalannya.
  return names.filter((n) => n === enc || (enc.length > 180 && n.startsWith(enc.slice(0, 180)))).map((n) => path.join(base, n));
}

/** Teks permintaan pengguna dari sebuah pesan (tanpa blok konteks yang ditambahkan Alexel Studio). */
export function promptTitle(content: unknown): string {
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    const texts = content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text as string);
    if (!texts.length) return "";
    text = texts[texts.length - 1];
  }
  const marker = text.lastIndexOf("### Permintaan\n");
  if (marker >= 0) text = text.slice(marker + 15);
  if (/^<(command|local-command|system)/.test(text.trim())) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

export interface SessionInfo {
  id: string;
  title: string;
  time_ms: number;
  messages: number;
}

/** Daftar sesi Claude Code untuk folder ini, terbaru dulu. */
export function claudeSessionsList(cwd: string, base?: string): SessionInfo[] {
  const out: SessionInfo[] = [];
  for (const dir of projectSessionDirs(cwd, base)) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const id = f.slice(0, -6);
      if (!validId(id)) continue;
      const full = path.join(dir, f);
      let mtime = 0;
      let head = "";
      try {
        const st = fs.statSync(full);
        mtime = st.mtimeMs;
        const fd = fs.openSync(full, "r");
        const buf = Buffer.alloc(Math.min(st.size, 256 * 1024));
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        head = buf.toString("utf8");
      } catch {
        continue;
      }
      let title = "";
      let custom = "";
      let messages = 0;
      for (const line of head.split("\n")) {
        if (!line) continue;
        let d: { type?: string; isSidechain?: boolean; message?: { content?: unknown }; title?: string; customTitle?: string };
        try {
          d = JSON.parse(line);
        } catch {
          continue;
        }
        if (d.type === "custom-title" && (d.customTitle || d.title)) custom = String(d.customTitle || d.title);
        if (d.isSidechain) continue;
        if (d.type === "user" || d.type === "assistant") messages++;
        if (!title && d.type === "user") title = promptTitle(d.message?.content);
      }
      if (!messages) continue;
      out.push({ id, title: custom || title || "Percakapan tanpa judul", time_ms: mtime, messages });
    }
  }
  return out.sort((a, b) => b.time_ms - a.time_ms).slice(0, 100);
}

/** Baris user/assistant sebuah sesi (maks 600 terakhir) untuk ditampilkan ulang di panel. */
export function claudeSessionLoad(cwd: string, id: string, base?: string): string[] {
  if (!validId(id)) throw new Error("Sesi tidak valid.");
  for (const dir of projectSessionDirs(cwd, base)) {
    const full = path.join(dir, `${id}.jsonl`);
    if (!fs.existsSync(full)) continue;
    const keep: string[] = [];
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue;
      try {
        const d = JSON.parse(line);
        if (d.isSidechain || (d.type !== "user" && d.type !== "assistant")) continue;
        keep.push(JSON.stringify({ type: d.type, message: d.message }));
      } catch {
        /* baris rusak dilewati */
      }
    }
    return keep.slice(-600);
  }
  throw new Error("Sesi tidak ditemukan.");
}

/**
 * Satu permintaan tanpa percakapan (Claude inline ⌘K): mode baca saja, hasil teks akhir.
 * Dibatalkan otomatis setelah 3 menit.
 */
export function claudeOnce(runId: string, projectDir: string, prompt: string, model: "fast" | "default" = "fast"): Promise<string> {
  if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) throw new Error("Konteks terlalu besar untuk dikirim (maks 400 KB).");
  const cli = findClaude();
  if (!cli) throw new Error("Claude Code CLI belum terpasang.");
  const cwd = projectDir && fs.existsSync(projectDir) ? projectDir : os.homedir();
  // Edit kecil di tempat: model cepat + effort rendah (model bawaan bisa butuh beberapa menit).
  const args = ["-p", "--output-format", "json", "--permission-mode", "plan", "--max-turns", "3"];
  if (model === "fast") args.push("--model", "sonnet", "--effort", "low");
  return new Promise((resolve, reject) => {
    const child = spawnCli(cli, args, cwd);
    runs.set(runId, child);
    let out = "";
    let err = "";
    const timer = setTimeout(() => killTree(child), 180_000);
    child.stdout?.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.stderr?.on("data", (b: Buffer) => {
      if (err.length < 8000) err += b.toString("utf8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      runs.delete(runId);
      reject(e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      runs.delete(runId);
      // Windows: taskkill membuat proses keluar dengan kode 1 tanpa sinyal.
      if (signal || cancelled.delete(runId)) return reject(new Error("Dibatalkan."));
      try {
        const j = JSON.parse(out.trim().split("\n").pop() ?? "{}") as { result?: string; is_error?: boolean };
        if (j.is_error || code !== 0) return reject(new Error(j.result || err.trim() || `Claude CLI keluar dengan kode ${code}.`));
        resolve(j.result ?? "");
      } catch {
        reject(new Error(err.trim() || "Jawaban Claude tidak bisa dibaca."));
      }
    });
    // Tanpa listener, EPIPE (CLI keluar sebelum prompt terkirim) membuat main process crash.
    child.stdin?.on("error", () => {});
    child.stdin?.end(prompt);
  });
}

const cancelled = new Set<string>();

export function claudeCancel(runId: string) {
  const c = runs.get(runId);
  if (!c) return;
  cancelled.add(runId);
  killTree(c);
}

export function killAllClaude() {
  for (const c of runs.values()) killTree(c);
  runs.clear();
  for (const l of sessions.values()) killTree(l.child);
  sessions.clear();
}
