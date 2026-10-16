// Terminal sungguhan lewat node-pty. Output digabung per ~8 ms supaya IPC tidak banjir.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";
import { spawn } from "node:child_process";
import { childEnv, findExecutable, isWin, posixShell, refreshPath, type Ctx } from "./util";

interface Session {
  pty: IPty;
  buf: string;
  timer: NodeJS.Timeout | null;
  started: number;
}

const sessions = new Map<number, Session>();
let next = 0;
let ptyMod: typeof import("node-pty") | null = null;

function loadPty(): typeof import("node-pty") {
  if (ptyMod) return ptyMod;
  // Windows terpaket: ConPTY memuat worker lewat path modulnya; muat dari folder unpacked supaya worker
  // tidak dibaca dari dalam app.asar. Gagal → pakai require biasa.
  if (isWin && __dirname.includes("app.asar")) {
    try {
      const unpacked = path.join(path.dirname(require.resolve("node-pty/package.json")).replace("app.asar", "app.asar.unpacked"), "lib", "index.js");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      if (fs.existsSync(unpacked)) ptyMod = require(unpacked) as typeof import("node-pty");
    } catch {
      /* pakai require biasa di bawah */
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!ptyMod) ptyMod = require("node-pty") as typeof import("node-pty");
  // Prebuild node-pty kadang tanpa izin eksekusi spawn-helper (macOS) → perbaiki.
  try {
    const base = path.dirname(require.resolve("node-pty/package.json")).replace("app.asar", "app.asar.unpacked");
    const helper = path.join(base, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  } catch {
    /* abaikan */
  }
  return ptyMod;
}

/** Windows: PowerShell 7 (pwsh) bila ada, kalau tidak Windows PowerShell (path absolut, bukan pencarian PATH node-pty). */
export function defaultShell(): string {
  if (isWin) return findExecutable("pwsh") ?? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return posixShell();
}

const WIN_UTF8 = "[Console]::OutputEncoding=[Text.Encoding]::UTF8";

/**
 * Skrip PowerShell untuk satu perintah Run: output UTF-8, lalu perintahnya, lalu `exit` yang meneruskan
 * kode keluar program (tanpa ini `-Command` hanya melaporkan 0/1 dan kegagalan kompilasi bisa terbaca sukses).
 */
export function winScript(command: string): string {
  return `${WIN_UTF8}; ${command}; if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } elseif (-not $?) { exit 1 }`;
}

/** Argumen shell. Windows: UTF-8 dan ExecutionPolicy Bypass (shim npm/npx .ps1) untuk Run maupun terminal interaktif. */
export function shellArgs(command?: string | null, win = isWin): string[] {
  if (win) {
    const base = ["-NoLogo", "-ExecutionPolicy", "Bypass"];
    return command?.trim() ? [...base, "-Command", winScript(command)] : [...base, "-NoExit", "-Command", WIN_UTF8];
  }
  return command?.trim() ? ["-l", "-c", command] : ["-l"];
}

export function ptySpawn(ctx: Ctx, cwd: string, cols: number, rows: number, command?: string | null, extraEnv?: Record<string, unknown> | null): number {
  const pty = loadPty();
  if (isWin) refreshPath(); // program yang baru dipasang harus langsung ketemu
  const shell = defaultShell();
  const args = shellArgs(command);
  const dir = cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory() ? cwd : os.homedir();
  // Variabel tambahan (mis. env dari debug adapter): hanya nama valid & nilai string.
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(extraEnv ?? {})) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === "string") extra[k] = v;
  const env = childEnv({ TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "AlexelStudio", ...(process.env.LANG ? {} : { LANG: "en_US.UTF-8" }), ...extra }) as Record<string, string>;
  const p = pty.spawn(shell, args, { name: "xterm-256color", cols: Math.max(10, cols), rows: Math.max(2, rows), cwd: dir, env });
  const id = ++next;
  const s: Session = { pty: p, buf: "", timer: null, started: Date.now() };
  sessions.set(id, s);
  let gotData = false;
  // Shell interaktif selalu mencetak prompt. Tidak ada keluaran sama sekali di Windows berarti ConPTY gagal start:
  // tampilkan petunjuk daripada tab kosong yang tampak "berjalan".
  if (isWin && !command?.trim()) {
    setTimeout(() => {
      if (!gotData && sessions.has(id)) ctx.emit("pty-data", { id, data: "\r\n\x1b[31m[Terminal tidak merespons. Coba tutup tab ini dan buka lagi; bila tetap kosong, jalankan Alexel Studio sebagai pengguna biasa (bukan administrator) dan laporkan di GitHub Issues.]\x1b[0m\r\n" });
    }, 6000);
  }
  const flush = () => {
    s.timer = null;
    if (s.buf) {
      ctx.emit("pty-data", { id, data: s.buf });
      s.buf = "";
    }
  };
  p.onData((d) => {
    gotData = true;
    s.buf += d;
    if (s.buf.length > 64 * 1024) flush();
    else if (!s.timer) s.timer = setTimeout(flush, 8);
  });
  p.onExit(({ exitCode }) => {
    if (s.timer) clearTimeout(s.timer);
    flush();
    sessions.delete(id);
    // Windows: tanpa kill() worker conout, handle ConPTY dan conhost bocor satu set per Run.
    if (isWin) {
      try {
        p.kill();
      } catch {
        /* sudah dilepas */
      }
    }
    ctx.emit("pty-exit", { id, code: exitCode, elapsed_ms: Date.now() - s.started });
  });
  return id;
}

export function ptyWrite(id: number, data: string) {
  const s = sessions.get(id);
  if (!s) throw new Error("Terminal sudah ditutup.");
  s.pty.write(data);
}

export function ptyResize(id: number, cols: number, rows: number) {
  sessions.get(id)?.pty.resize(Math.max(10, cols), Math.max(2, rows));
}

/** Hentikan sesi: SIGHUP ke seluruh grup proses, lalu SIGKILL kalau masih hidup. */
export function ptyKill(id: number) {
  const s = sessions.get(id);
  if (!s) return;
  const pid = s.pty.pid;
  if (isWin) {
    // Windows tidak punya sinyal/grup proses: hentikan seluruh pohon proses.
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
    return;
  }
  try {
    process.kill(-pid, "SIGHUP");
  } catch {
    try {
      s.pty.kill();
    } catch {
      /* sudah mati */
    }
  }
  setTimeout(() => {
    if (sessions.has(id)) {
      try {
        process.kill(-pid, "SIGKILL");
        s.pty.kill("SIGKILL");
      } catch {
        /* sudah mati */
      }
    }
  }, 1500);
}

export function killAllPtys() {
  for (const id of [...sessions.keys()]) ptyKill(id);
}
