// Sesi terminal xterm.js + PTY. Instance xterm hidup di luar React (elemen host
// dipindah-pindah antar container), jadi riwayat terminal tidak hilang saat panel
// ditutup atau desain diganti.

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { api, errMsg, on, openExternal } from "../lib/ipc";
import { formatDuration, stripAnsi } from "../lib/format";
import { basename } from "../lib/paths";
import { getState, setState, toast, useStore, type TermSession } from "../state/store";

interface Runtime {
  key: string;
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  ptyId: number | null;
  plain: string;
  ro: ResizeObserver | null;
}

const runtimes = new Map<string, Runtime>();
const byPty = new Map<number, string>();
const pending = new Map<number, string[]>();
let counter = 0;
let initialized = false;

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function theme(): ITheme {
  return {
    background: cssVar("--term-bg", "#0b0d12"),
    foreground: cssVar("--term-fg", "#c9d1e0"),
    cursor: cssVar("--accent", "#7aa2f7"),
    cursorAccent: cssVar("--term-bg", "#0b0d12"),
    selectionBackground: cssVar("--ed-selection", "rgba(122,162,247,.3)"),
    black: cssVar("--ansi-black", "#1a1d26"),
    red: cssVar("--ansi-red", "#ff6b6b"),
    green: cssVar("--ansi-green", "#5ee0a0"),
    yellow: cssVar("--ansi-yellow", "#febc2e"),
    blue: cssVar("--ansi-blue", "#7aa2f7"),
    magenta: cssVar("--ansi-magenta", "#c792ea"),
    cyan: cssVar("--ansi-cyan", "#89ddff"),
    white: cssVar("--ansi-white", "#c9d1e0"),
    brightBlack: cssVar("--ansi-bright-black", "#5d6680"),
    brightRed: cssVar("--ansi-red", "#ff6b6b"),
    brightGreen: cssVar("--ansi-green", "#5ee0a0"),
    brightYellow: cssVar("--ansi-yellow", "#febc2e"),
    brightBlue: cssVar("--ansi-blue", "#7aa2f7"),
    brightMagenta: cssVar("--ansi-magenta", "#c792ea"),
    brightCyan: cssVar("--ansi-cyan", "#89ddff"),
    brightWhite: cssVar("--ansi-bright-white", "#ffffff"),
  };
}

function patch(key: string, p: Partial<TermSession>) {
  setState((s) => ({ terminals: s.terminals.map((t) => (t.key === key ? { ...t, ...p } : t)) }));
}

function feed(rt: Runtime, data: string) {
  rt.term.write(data);
  rt.plain = (rt.plain + data).slice(-24_000);
}

function init() {
  if (initialized) return;
  initialized = true;
  void on<{ id: number; data: string }>("pty-data", ({ id, data }) => {
    const key = byPty.get(id);
    const rt = key ? runtimes.get(key) : undefined;
    if (rt) feed(rt, data);
    else pending.set(id, [...(pending.get(id) ?? []), data]);
  });
  void on<{ id: number; code: number | null; elapsed_ms: number }>("pty-exit", ({ id, code, elapsed_ms }) => {
    const key = byPty.get(id);
    if (!key) return;
    byPty.delete(id);
    const rt = runtimes.get(key);
    const sess = getState().terminals.find((t) => t.key === key);
    if (rt) {
      rt.ptyId = null;
      const ok = code === 0;
      const label = sess?.kind === "shell" ? "Shell selesai" : ok ? "Selesai" : "Berhenti";
      rt.term.write(`\r\n\x1b[2m── ${label} · kode ${code ?? "?"} · ${formatDuration(elapsed_ms)} ──\x1b[0m\r\n`);
    }
    patch(key, { status: "exited", exitCode: code, elapsedMs: elapsed_ms, ptyId: null });
    if (sess?.kind === "run" && code !== 0 && code !== 130 && code !== null) {
      toast(`${sess.title} gagal (kode ${code})`, "error", {
        label: "Tanya Claude",
        run: () => void import("../claude/claude").then((m) => m.explainTerminal(key)),
      });
    }
  });
  // Ikuti perubahan desain.
  useStore.subscribe((s, prev) => {
    if (s.settings.design !== prev.settings.design || s.settings.accent !== prev.settings.accent) {
      requestAnimationFrame(() => runtimes.forEach((rt) => (rt.term.options.theme = theme())));
    }
    if (s.settings.terminalFontSize !== prev.settings.terminalFontSize) {
      runtimes.forEach((rt) => {
        rt.term.options.fontSize = s.settings.terminalFontSize;
        safeFit(rt);
      });
    }
  });
}

function safeFit(rt: Runtime) {
  if (!rt.host.isConnected || rt.host.clientWidth < 20 || rt.host.clientHeight < 20) return;
  try {
    rt.fit.fit();
  } catch {
    /* host belum punya ukuran */
  }
}

function createRuntime(key: string): Runtime {
  const host = document.createElement("div");
  host.className = "term-host";
  const term = new Terminal({
    fontFamily: cssVar("--font-mono", "Menlo, monospace"),
    fontSize: getState().settings.terminalFontSize,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: false,
    macOptionIsMeta: true,
    theme: theme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_e, uri) => void openExternal(uri)));
  term.open(host);
  const rt: Runtime = { key, term, fit, host, ptyId: null, plain: "", ro: null };
  term.onData((d) => {
    if (rt.ptyId !== null) void api.ptyWrite(rt.ptyId, d).catch(() => {});
  });
  term.onResize(({ cols, rows }) => {
    if (rt.ptyId !== null) void api.ptyResize(rt.ptyId, cols, rows).catch(() => {});
  });
  runtimes.set(key, rt);
  return rt;
}

async function spawn(rt: Runtime, cwd: string, command?: string) {
  const { cols, rows } = rt.term;
  try {
    const id = await api.ptySpawn(cwd, cols || 100, rows || 24, command);
    rt.ptyId = id;
    byPty.set(id, rt.key);
    for (const chunk of pending.get(id) ?? []) feed(rt, chunk);
    pending.delete(id);
    patch(rt.key, { ptyId: id, status: "running", startedAt: Date.now(), exitCode: undefined });
  } catch (e) {
    rt.term.write(`\x1b[31mGagal membuka terminal: ${errMsg(e)}\x1b[0m\r\n`);
    patch(rt.key, { status: "exited", exitCode: null });
  }
}

export async function newTerminal(opts: { kind?: TermSession["kind"]; title?: string; cwd?: string; command?: string; focus?: boolean } = {}): Promise<string> {
  init();
  const s = getState();
  const cwd = opts.cwd ?? s.root ?? "";
  const kind = opts.kind ?? "shell";
  const key = `t${++counter}`;
  const shells = s.terminals.filter((t) => t.kind === "shell").length;
  const title = opts.title ?? (kind === "shell" ? `zsh ${shells + 1}` : basename(cwd));
  const sess: TermSession = { key, ptyId: null, title, kind, cwd, command: opts.command, status: "starting", startedAt: Date.now() };
  setState((st) => ({ terminals: [...st.terminals, sess], activeTerminal: key }));
  const rt = createRuntime(key);
  if (opts.command && kind !== "shell") rt.term.write(`\x1b[36m$ ${opts.command}\x1b[0m\r\n`);
  const { togglePanel } = await import("../app/actions");
  const l = getState().layouts[getState().settings.design];
  if (!l.panel || l.panelTab !== "terminal") togglePanel("terminal");
  // Tunggu panel terpasang supaya ukuran kolom/baris benar sebelum spawn.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  safeFit(rt);
  await spawn(rt, cwd, opts.command);
  if (opts.focus !== false) rt.term.focus();
  return key;
}

/** Jalankan perintah di sesi "run". Sesi run yang sudah selesai untuk perintah sama dipakai ulang. */
export async function runCommand(command: string, cwd: string, title: string): Promise<string> {
  init();
  const reuse = getState().terminals.find((t) => t.kind === "run" && t.command === command && t.cwd === cwd && t.status === "exited");
  if (reuse) {
    await rerun(reuse.key);
    return reuse.key;
  }
  return newTerminal({ kind: "run", title, cwd, command });
}

export async function rerun(key: string) {
  const sess = getState().terminals.find((t) => t.key === key);
  const rt = runtimes.get(key);
  if (!sess || !rt) return;
  if (rt.ptyId !== null) await api.ptyKill(rt.ptyId).catch(() => {});
  rt.term.write(`\r\n\x1b[36m$ ${sess.command ?? ""}\x1b[0m\r\n`);
  setState({ activeTerminal: key });
  await spawn(rt, sess.cwd, sess.command);
}

export async function stopTerminal(key: string) {
  const rt = runtimes.get(key);
  if (rt?.ptyId != null) await api.ptyKill(rt.ptyId).catch(() => {});
}

export async function closeTerminal(key: string) {
  const rt = runtimes.get(key);
  if (rt) {
    if (rt.ptyId !== null) {
      byPty.delete(rt.ptyId);
      await api.ptyKill(rt.ptyId).catch(() => {});
    }
    rt.ro?.disconnect();
    rt.term.dispose();
    rt.host.remove();
    runtimes.delete(key);
  }
  setState((s) => {
    const terminals = s.terminals.filter((t) => t.key !== key);
    return { terminals, activeTerminal: s.activeTerminal === key ? terminals[terminals.length - 1]?.key ?? null : s.activeTerminal };
  });
}

/** Tempelkan terminal ke container (dipanggil komponen panel). */
export function attachTerminal(key: string, container: HTMLElement): () => void {
  const rt = runtimes.get(key);
  if (!rt) return () => {};
  if (rt.host.parentElement !== container) container.appendChild(rt.host);
  rt.ro?.disconnect();
  rt.ro = new ResizeObserver(() => safeFit(rt));
  rt.ro.observe(container);
  requestAnimationFrame(() => safeFit(rt));
  return () => {
    rt.ro?.disconnect();
    rt.ro = null;
  };
}

export function focusTerminal(key: string | null) {
  if (key) runtimes.get(key)?.term.focus();
}

export function clearTerminal(key: string) {
  const rt = runtimes.get(key);
  rt?.term.clear();
  if (rt) rt.plain = "";
}

export function recentOutput(key: string, max = 6000): string {
  const rt = runtimes.get(key);
  if (!rt) return "";
  return stripAnsi(rt.plain).slice(-max).trim();
}

export function writeToActive(text: string) {
  const key = getState().activeTerminal;
  const rt = key ? runtimes.get(key) : undefined;
  if (rt?.ptyId != null) void api.ptyWrite(rt.ptyId, text);
}

export function hasRunning(): boolean {
  return getState().terminals.some((t) => t.status === "running" && t.kind !== "shell");
}
