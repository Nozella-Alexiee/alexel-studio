// Helper bersama main process: PATH macOS, quoting shell, menjalankan proses
// dengan batas waktu, dan env git yang tidak pernah menunggu input.

import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import os from "node:os";
import path from "node:path";

export const isMac = process.platform === "darwin";
export const isWin = process.platform === "win32";

let cachedPath: string | null = null;

/** PATH dari shell login+interaktif pengguna (nvm, pyenv, volta ikut), dengan batas 4 detik. */
function shellPath(): string {
  if (isWin) return process.env.PATH ?? "";
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const r = spawnSync(shell, ["-ilc", 'printf "__NOZEL_PATH__%s__END__" "$PATH"'], { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] });
    const m = /__NOZEL_PATH__(.*)__END__/s.exec(r.stdout ?? "");
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

/**
 * PATH untuk semua proses anak. Urutan: PATH shell pengguna, lalu lokasi umum.
 * Entri kosong/relatif dibuang supaya `./node` dari repo tidak ikut terpanggil.
 */
export function augmentedPath(): string {
  if (cachedPath) return cachedPath;
  const home = os.homedir();
  const sep = isWin ? ";" : ":";
  const parts: string[] = [];
  const push = (p: string) => {
    if (p && path.isAbsolute(p) && !parts.includes(p)) parts.push(p);
  };
  shellPath().split(sep).forEach(push);
  if (!isWin) {
    [
      `${home}/.local/bin`,
      `${home}/.claude/local`,
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      `${home}/.cargo/bin`,
      `${home}/.bun/bin`,
      `${home}/.deno/bin`,
      `${home}/go/bin`,
      `${home}/.npm-global/bin`,
      `${home}/Library/pnpm`,
      `${home}/.composer/vendor/bin`,
      `${home}/.volta/bin`,
      `${home}/.pyenv/shims`,
      "/usr/local/go/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].forEach(push);
  }
  (process.env.PATH ?? "").split(sep).forEach(push);
  cachedPath = parts.join(sep);
  return cachedPath;
}

export function warmPath() {
  setTimeout(() => augmentedPath(), 50);
}

export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, PATH: augmentedPath(), ...extra };
}

/** Quote satu argumen untuk shell POSIX: 'a'\''b'. */
export function shellQuote(s: string): string {
  if (s && /^[A-Za-z0-9/._\-+=:,@%]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export interface Captured {
  stdout: string;
  stderr: string;
  code: number | null;
  success: boolean;
  timedOut: boolean;
  elapsedMs: number;
}

/** Jalankan proses dan tunggu hasilnya; dibunuh bila melewati batas waktu. stdin selalu ditutup. */
export function runCapture(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; input?: string } = {}): Promise<Captured> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const spawnOpts: SpawnOptions = { cwd: opts.cwd, env: opts.env ?? childEnv(), stdio: [opts.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"], windowsHide: true };
    let child;
    try {
      child = spawn(cmd, args, spawnOpts);
    } catch (e) {
      return reject(new Error(`Gagal menjalankan ${cmd}: ${(e as Error).message}`));
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    const LIMIT = 32 * 1024 * 1024;
    child.stdout?.on("data", (b: Buffer) => {
      size += b.length;
      if (size < LIMIT) out.push(b);
    });
    child.stderr?.on("data", (b: Buffer) => err.push(b));
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 15000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(e.message.includes("ENOENT") ? `Perintah tidak ditemukan: ${cmd}` : e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        code,
        success: code === 0 && !timedOut,
        timedOut,
        elapsedMs: Date.now() - start,
      });
    });
  });
}

/** Env git: prompt kredensial mati, ssh batch mode, lock opsional mati. */
export function gitEnv(): NodeJS.ProcessEnv {
  return childEnv({
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=15",
    LC_ALL: "C",
  });
}

/** Tolak path relatif atau yang mengandung '..'. */
export function ensureCleanPath(p: string) {
  if (!path.isAbsolute(p)) throw new Error("Path harus absolut.");
  if (p.split(/[\\/]+/).includes("..")) throw new Error("Path tidak boleh mengandung '..'.");
}

export const HEAVY_DIRS = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".gradle",
  "Pods",
  ".turbo",
  ".cache",
  "dist-electron",
  "release",
]);

/** Konteks yang diberikan main process ke setiap modul (supaya modul bisa dites tanpa Electron). */
export interface Ctx {
  userData: string;
  emit: (event: string, payload: unknown) => void;
  /** Pindahkan ke Trash (shell.trashItem di Electron). */
  trash: (p: string) => Promise<void>;
  /** Tampilkan di Finder (shell.showItemInFolder). */
  reveal: (p: string) => void;
}
