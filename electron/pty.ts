// Terminal sungguhan lewat node-pty. Output digabung per ~8 ms supaya IPC tidak banjir.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";
import { childEnv, isWin, type Ctx } from "./util";

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ptyMod = require("node-pty") as typeof import("node-pty");
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

export function defaultShell(): string {
  if (isWin) return process.env.COMSPEC?.toLowerCase().includes("powershell") ? process.env.COMSPEC : "powershell.exe";
  const s = process.env.SHELL;
  return s && fs.existsSync(s) ? s : "/bin/zsh";
}

export function ptySpawn(ctx: Ctx, cwd: string, cols: number, rows: number, command?: string | null): number {
  const pty = loadPty();
  const shell = defaultShell();
  const args = isWin ? (command ? ["-NoLogo", "-Command", command] : ["-NoLogo"]) : command?.trim() ? ["-l", "-c", command] : ["-l"];
  const dir = cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory() ? cwd : os.homedir();
  const env = childEnv({ TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "NozelCode", ...(process.env.LANG ? {} : { LANG: "en_US.UTF-8" }) }) as Record<string, string>;
  const p = pty.spawn(shell, args, { name: "xterm-256color", cols: Math.max(10, cols), rows: Math.max(2, rows), cwd: dir, env });
  const id = ++next;
  const s: Session = { pty: p, buf: "", timer: null, started: Date.now() };
  sessions.set(id, s);
  const flush = () => {
    s.timer = null;
    if (s.buf) {
      ctx.emit("pty-data", { id, data: s.buf });
      s.buf = "";
    }
  };
  p.onData((d) => {
    s.buf += d;
    if (s.buf.length > 64 * 1024) flush();
    else if (!s.timer) s.timer = setTimeout(flush, 8);
  });
  p.onExit(({ exitCode }) => {
    if (s.timer) clearTimeout(s.timer);
    flush();
    sessions.delete(id);
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
  try {
    if (!isWin) process.kill(-pid, "SIGHUP");
    else s.pty.kill();
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
        if (!isWin) process.kill(-pid, "SIGKILL");
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
