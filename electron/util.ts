// Helper bersama main process: PATH macOS, quoting shell, menjalankan proses
// dengan batas waktu, dan env git yang tidak pernah menunggu input.

import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const isMac = process.platform === "darwin";
export const isWin = process.platform === "win32";

let cachedPath: string | null = null;

/** Shell POSIX pengguna: $SHELL, lalu zsh (macOS) / bash / sh yang benar-benar ada. */
export function posixShell(): string {
  const cands = [process.env.SHELL, isMac ? "/bin/zsh" : "", "/bin/bash", "/usr/bin/bash", "/bin/sh"];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return "/bin/sh";
}

/** PATH dari shell login+interaktif pengguna (nvm, pyenv, volta ikut), dengan batas 4 detik. */
function shellPath(): string {
  if (isWin) return process.env.PATH ?? process.env.Path ?? "";
  const shell = posixShell();
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
      "/home/linuxbrew/.linuxbrew/bin",
      `${home}/.local/share/pnpm`,
      "/snap/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].forEach(push);
  } else {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    [
      path.join(appData, "npm"),
      path.join(home, ".local", "bin"),
      path.join(home, ".cargo", "bin"),
      path.join(home, "scoop", "shims"),
      path.join(home, "go", "bin"),
      path.join(local, "Programs", "Microsoft VS Code", "bin"),
      path.join(local, "pnpm"),
      "C:\\Program Files\\nodejs",
      "C:\\Program Files\\Git\\cmd",
    ].forEach(push);
  }
  (process.env.PATH ?? process.env.Path ?? "").split(sep).forEach(push);
  cachedPath = parts.join(sep);
  return cachedPath;
}

export function warmPath() {
  setTimeout(() => augmentedPath(), 50);
}

export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Windows: "Path" dan "PATH" bisa sama-sama ada; sisakan satu.
  for (const k of Object.keys(env)) if (k.toUpperCase() === "PATH") delete env[k];
  // AppImage menyuntikkan variabel yang tidak boleh bocor ke program pengguna.
  for (const k of ["APPIMAGE", "APPDIR", "OWD", "ARGV0", "LD_LIBRARY_PATH", "ELECTRON_RUN_AS_NODE"]) delete env[k];
  return { ...env, PATH: augmentedPath(), ...extra };
}

/**
 * Cari program di PATH (augmented). Di Windows mencoba ekstensi PATHEXT, mendahulukan .exe
 * lalu .cmd; tanpa ekstensi tidak dipakai (bisa mengenai skrip sh milik npm).
 */
export function findExecutable(name: string, extraDirs: string[] = []): string | null {
  const dirs = [...extraDirs, ...augmentedPath().split(isWin ? ";" : ":")];
  const exts = isWin ? [".exe", ".cmd", ".bat", ".com"] : [""];
  for (const d of dirs) {
    for (const ext of exts) {
      const p = path.join(d, name + ext);
      try {
        if (fs.statSync(p).isFile()) {
          if (!isWin) fs.accessSync(p, fs.constants.X_OK);
          return p;
        }
      } catch {
        /* lanjut */
      }
    }
  }
  return null;
}

/**
 * Quote argumen untuk cmd.exe /c. Hanya dipakai untuk shim .cmd dengan argumen sederhana
 * (flag seperti --stdio); data panjang (prompt) selalu lewat stdin, bukan argumen.
 */
function cmdQuote(s: string): string {
  if (/^[\w.:\\/=-]+$/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Program + argumen yang aman untuk `spawn` tanpa `shell:true`. Shim .cmd/.bat di Windows tidak
 * boleh di-spawn langsung (Node menolak, EINVAL), jadi dijalankan lewat `cmd.exe /d /s /c`.
 */
export function spawnable(file: string, args: string[]): { cmd: string; args: string[]; verbatim: boolean } {
  if (isWin && /\.(cmd|bat)$/i.test(file)) {
    const line = [file, ...args].map(cmdQuote).join(" ");
    return { cmd: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
  }
  return { cmd: file, args, verbatim: false };
}

/** Hentikan proses beserta anak-anaknya (Windows: taskkill /T; lainnya: sinyal biasa). */
export function killTree(child: { pid?: number; kill: (sig?: NodeJS.Signals) => boolean }, signal: NodeJS.Signals = "SIGTERM") {
  if (isWin && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
  } else child.kill(signal);
}

/** Quote untuk PowerShell: '...' dengan ' digandakan. */
export function psQuote(s: string): string {
  if (s && /^[A-Za-z0-9_.\\/][A-Za-z0-9_.\\/:-]*$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
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
    const sp = spawnable(cmd, args);
    const spawnOpts: SpawnOptions = { cwd: opts.cwd, env: opts.env ?? childEnv(), stdio: [opts.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: sp.verbatim };
    let child;
    try {
      child = spawn(sp.cmd, sp.args, spawnOpts);
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
    let done = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 15000);
    child.on("error", (e) => {
      clearTimeout(timer);
      done = true;
      reject(new Error(e.message.includes("ENOENT") ? `Perintah tidak ditemukan: ${cmd}` : e.message));
    });
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        code,
        success: code === 0 && !timedOut,
        timedOut,
        elapsedMs: Date.now() - start,
      });
    };
    child.on("close", finish);
    // Setelah dibunuh, cucu proses (mis. `sleep` di bawah dash) bisa menahan pipe tetap terbuka
    // sehingga "close" baru datang saat cucu itu selesai. Jangan tunggu.
    child.on("exit", (code) => {
      if (!timedOut) return;
      child.stdout?.destroy();
      child.stderr?.destroy();
      finish(code);
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
