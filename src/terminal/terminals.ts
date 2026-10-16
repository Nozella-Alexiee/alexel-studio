// Sesi terminal xterm.js + PTY. Instance xterm hidup di luar React (elemen host
// dipindah-pindah antar container), jadi riwayat terminal tidak hilang saat panel
// ditutup atau desain diganti.

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { api, errMsg, isMac, isWindows, on, openExternal } from "../lib/ipc";
import { formatDuration, stripAnsi } from "../lib/format";
import { basename } from "../lib/paths";
import { getState, setState, toast, useStore, type TermSession } from "../state/store";
import { tl } from "../i18n";

interface Runtime {
  key: string;
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  ptyId: number | null;
  plain: string;
  ro: ResizeObserver | null;
  /** Variabel lingkungan tambahan untuk proses (dipakai ulang saat Run ulang). */
  env?: Record<string, string>;
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

/** Nomor build Windows (dibutuhkan xterm untuk perilaku ConPTY); 0 = tidak diketahui. */
let winBuild = 0;

function init() {
  if (initialized) return;
  initialized = true;
  if (isWindows) void api.appInfo().then((i) => (winBuild = Number((i as { osBuild?: string }).osBuild) || 0)).catch(() => {});
  void on<{ id: number; data: string }>("pty-data", ({ id, data }) => {
    const key = byPty.get(id);
    const rt = key ? runtimes.get(key) : undefined;
    if (rt) feed(rt, data);
    // Data bisa tiba sebelum spawn() sempat mencatat id; simpan sebentar saja.
    else if ((pending.get(id)?.length ?? 0) < 200) pending.set(id, [...(pending.get(id) ?? []), data]);
  });
  void on<{ id: number; code: number | null; elapsed_ms: number }>("pty-exit", ({ id, code, elapsed_ms }) => {
    const key = byPty.get(id);
    if (!key) return;
    byPty.delete(id);
    const rt = runtimes.get(key);
    const sess = getState().terminals.find((t) => t.key === key);
    // Dihentikan pengguna (Stop): di Windows taskkill menghasilkan kode 1, itu bukan kegagalan program.
    const stopped = userStopped.delete(key);
    // Ctrl+C di Windows: STATUS_CONTROL_C_EXIT, setara interupsi (130) di POSIX.
    if (code === 3221225786) code = 130;
    if (rt) {
      rt.ptyId = null;
      const ok = code === 0;
      const label = stopped ? tl("Dihentikan") : sess?.kind === "shell" ? tl("Shell selesai") : ok ? tl("Selesai") : tl("Berhenti");
      rt.term.write(`\r\n\x1b[2m── ${label} · ${tl("kode {code}", { code: code ?? "?" })} · ${formatDuration(elapsed_ms)} ──\x1b[0m\r\n`);
    }
    patch(key, { status: "exited", exitCode: code, elapsedMs: elapsed_ms, ptyId: null });
    if (sess?.kind === "run" && !stopped) void import("../components/PenguinMascot").then((m) => m.flashPenguin(code === 0 ? "sukses" : "error", code === 0 ? 6000 : 9000));
    if (sess?.kind === "run" && !stopped && code !== 0 && code !== 130 && code !== null) {
      toast(tl("{name} gagal (kode {code})", { name: sess.title, code: String(code) }), "error", {
        label: tl("Tanya agen AI"),
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

/** Sesi yang dihentikan lewat tombol Stop/Tutup: keluarnya bukan kegagalan. */
const userStopped = new Set<string>();

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
    // Seperti VS Code: Option tetap mengetik karakter (@ [ ] { } di keyboard non-US).
    macOptionIsMeta: false,
    theme: theme(),
    // ConPTY mengatur ulang tampilan sendiri saat resize; tanpa ini baris terlipat salah di Windows.
    ...(isWindows ? { windowsPty: { backend: "conpty" as const, buildNumber: winBuild } } : {}),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_e, uri) => void openExternal(uri)));
  term.open(host);
  const rt: Runtime = { key, term, fit, host, ptyId: null, plain: "", ro: null };
  // Windows/Linux: Ctrl+C menyalin bila ada seleksi (tanpa seleksi tetap Ctrl+C ke program); Ctrl+V / Ctrl+Shift+V menempel.
  if (!isMac) {
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || e.altKey || e.metaKey) return true;
      const k = e.key.toLowerCase();
      if (k === "c" && (e.shiftKey || term.hasSelection())) {
        if (term.hasSelection()) void navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        e.preventDefault();
        return false;
      }
      if (k === "v") {
        e.preventDefault();
        void navigator.clipboard.readText().then((t) => t && term.paste(t), () => {});
        return false;
      }
      return true;
    });
  }
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
    const id = await api.ptySpawn(cwd, cols || 100, rows || 24, command, rt.env);
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

export async function newTerminal(opts: { kind?: TermSession["kind"]; title?: string; cwd?: string; command?: string; focus?: boolean; env?: Record<string, string> } = {}): Promise<string> {
  init();
  const s = getState();
  const cwd = opts.cwd ?? s.root ?? "";
  const kind = opts.kind ?? "shell";
  const key = `t${++counter}`;
  const shells = s.terminals.filter((t) => t.kind === "shell").length;
  const title = opts.title ?? (kind === "shell" ? `Terminal ${shells + 1}` : basename(cwd));
  const sess: TermSession = { key, ptyId: null, title, kind, cwd, command: opts.command, status: "starting", startedAt: Date.now() };
  setState((st) => ({ terminals: [...st.terminals, sess], activeTerminal: key }));
  const rt = createRuntime(key);
  rt.env = opts.env;
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
export async function runCommand(command: string, cwd: string, title: string, opts: { focus?: boolean; env?: Record<string, string> } = {}): Promise<string> {
  init();
  const same = getState().terminals.find((t) => t.kind === "run" && t.command === command && t.cwd === cwd);
  // Perintah yang sama masih berjalan (mis. dev server): hentikan dulu lalu mulai ulang, jangan jalankan salinan kedua.
  if (same && same.status === "running") {
    await stopTerminal(same.key);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (same) {
    const rt = runtimes.get(same.key);
    if (rt) rt.env = opts.env;
    await rerun(same.key);
    return same.key;
  }
  return newTerminal({ kind: "run", title, cwd, command, focus: opts.focus, env: opts.env });
}

export async function rerun(key: string) {
  const sess = getState().terminals.find((t) => t.key === key);
  const rt = runtimes.get(key);
  if (!sess || !rt) return;
  if (rt.ptyId !== null) {
    // Lepas pemetaan proses lama dulu: event exit-nya yang datang belakangan tidak boleh
    // menandai proses baru sebagai selesai.
    const old = rt.ptyId;
    byPty.delete(old);
    pending.delete(old);
    rt.ptyId = null;
    await api.ptyKill(old).catch(() => {});
  }
  rt.term.write(`\r\n\x1b[36m$ ${sess.command ?? ""}\x1b[0m\r\n`);
  setState({ activeTerminal: key });
  await spawn(rt, sess.cwd, sess.command);
}

export async function stopTerminal(key: string) {
  const rt = runtimes.get(key);
  if (rt?.ptyId != null) {
    userStopped.add(key);
    await api.ptyKill(rt.ptyId).catch(() => {});
  }
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
  // Satu container dipakai bergantian oleh semua sesi: hanya host sesi aktif yang terpasang,
  // host lain dilepas (instance xterm tetap hidup di `runtimes`, riwayatnya tidak hilang).
  if (container.firstChild !== rt.host || container.childNodes.length !== 1) container.replaceChildren(rt.host);
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
