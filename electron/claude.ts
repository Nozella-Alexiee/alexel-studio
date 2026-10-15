// Jembatan ke Claude Code CLI resmi (langganan Pro/Max, tanpa API key).
// Prompt lewat stdin; output stream-json diteruskan baris per baris sebagai `claude-event`.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { augmentedPath, childEnv, isWin, runCapture, type Ctx } from "./util";

const MAX_PROMPT_BYTES = 400 * 1024;
const runs = new Map<string, ChildProcess>();

export function findClaude(): string | null {
  const exe = isWin ? "claude.cmd" : "claude";
  for (const dir of augmentedPath().split(isWin ? ";" : ":")) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  for (const p of [path.join(os.homedir(), ".claude/local/claude"), path.join(os.homedir(), ".local/bin/claude")]) if (fs.existsSync(p)) return p;
  return bundledWithDesktop();
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
    if (r.success) return { installed: true, path: p, version: r.stdout.trim(), error: null };
    return { installed: false, path: p, version: null, error: `claude ditemukan tapi gagal jalan: ${r.timedOut ? "timeout" : r.stderr.trim()}` };
  } catch (e) {
    return { installed: false, path: p, version: null, error: (e as Error).message };
  }
}

/**
 * Mode izin: "read" = Claude hanya membaca & menyarankan (`plan`), "edit" = boleh mengubah berkas
 * di folder project (`acceptEdits`). Perintah shell tetap ditolak di mode non-interaktif.
 */
export function claudeRun(ctx: Ctx, runId: string, projectDir: string, prompt: string, resume?: string | null, mode: "read" | "edit" = "read") {
  if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) throw new Error("Konteks terlalu besar untuk dikirim (maks 400 KB).");
  const cli = findClaude();
  if (!cli) throw new Error("Claude Code CLI belum terpasang.");
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", mode === "edit" ? "acceptEdits" : "plan"];
  if (resume && /^[A-Za-z0-9-]+$/.test(resume)) args.push("--resume", resume);
  const cwd = projectDir && fs.existsSync(projectDir) ? projectDir : os.homedir();
  const child = spawn(cli, args, { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  runs.set(runId, child);
  child.stdin?.end(prompt);
  let stderr = "";
  child.stderr?.on("data", (b: Buffer) => {
    if (stderr.length < 8000) stderr += b.toString("utf8");
  });
  const rl = readline.createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    if (line.trim()) ctx.emit("claude-event", { run_id: runId, line });
  });
  let done = false;
  const finish = (code: number | null) => {
    if (done) return;
    done = true;
    runs.delete(runId);
    ctx.emit("claude-done", { run_id: runId, code, stderr: stderr.slice(0, 4000) });
  };
  child.on("error", (e) => {
    stderr += e.message;
    finish(null);
  });
  child.on("close", (code, signal) => finish(signal ? 130 : code));
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
    const child = spawn(cli, args, { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    runs.set(runId, child);
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 180_000);
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
      if (signal) return reject(new Error("Dibatalkan."));
      try {
        const j = JSON.parse(out.trim().split("\n").pop() ?? "{}") as { result?: string; is_error?: boolean };
        if (j.is_error || code !== 0) return reject(new Error(j.result || err.trim() || `Claude CLI keluar dengan kode ${code}.`));
        resolve(j.result ?? "");
      } catch {
        reject(new Error(err.trim() || "Jawaban Claude tidak bisa dibaca."));
      }
    });
    child.stdin?.end(prompt);
  });
}

export function claudeCancel(runId: string) {
  runs.get(runId)?.kill("SIGTERM");
}

export function killAllClaude() {
  for (const c of runs.values()) c.kill("SIGTERM");
  runs.clear();
}
