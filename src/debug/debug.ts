// Pengendali debugger: konfigurasi launch (.vscode/launch.json atau otomatis dari berkas aktif),
// alur DAP (initialize → launch → breakpoint → configurationDone), berhenti/step/lanjut,
// variabel, watch, debug console, dan sesi anak (js-debug startDebugging).

import * as docs from "../editor/documents";
import { api, errMsg, isWindows } from "../lib/ipc";
import { basename, dirname, isInside, join, relative } from "../lib/paths";
import { activeTab, confirmDialog, getState, setLayout, toast } from "../state/store";
import { DapClient } from "./client";
import { setBpsEffect, setDebugLineEffect } from "./editor";
import { consoleLine, dbg, isDebugging, setDbg, type Breakpoint, type Frame } from "./state";
import { tl } from "../i18n";

export interface LaunchConfig {
  name: string;
  type: string;
  request: "launch" | "attach";
  [k: string]: unknown;
}

type Kind = "lldb" | "node" | "python" | "go";

const KIND: Record<string, Kind> = { "pwa-node": "node", node: "node", "node-terminal": "node", python: "python", debugpy: "python", lldb: "lldb", "lldb-dap": "lldb", codelldb: "lldb", cppdbg: "lldb", go: "go" };
/** Tipe yang dikirim ke adapter (js-debug memakai "pwa-node", lldb-dap memakai "lldb-dap"). */
const ADAPTER_TYPE: Record<Kind, string> = { node: "pwa-node", python: "debugpy", lldb: "lldb-dap", go: "go" };

export const kindOf = (type: string): Kind | null => KIND[type] ?? null;

// ---------------- Konfigurasi ----------------

/** Hapus komentar & koma berlebih dari JSONC (launch.json). */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Ganti variabel VS Code (${workspaceFolder}, ${file}, …) di konfigurasi. */
export function substitute<T>(v: T, vars: Record<string, string>): T {
  if (typeof v === "string") return v.replace(/\$\{(\w+)\}/g, (m, k) => vars[k] ?? m) as T;
  if (Array.isArray(v)) return v.map((x) => substitute(x, vars)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, substitute(x, vars)])) as T;
  return v;
}

function varsNow(): Record<string, string> {
  const root = getState().root ?? "";
  const tab = activeTab();
  const file = tab?.kind === "text" ? tab.id : "";
  const base = basename(file);
  return {
    workspaceFolder: root,
    workspaceRoot: root,
    workspaceFolderBasename: basename(root),
    file,
    fileBasename: base,
    fileBasenameNoExtension: base.replace(/\.[^.]+$/, ""),
    fileDirname: file ? dirname(file) : root,
    fileExtname: base.includes(".") ? `.${base.split(".").pop()}` : "",
    relativeFile: file && root ? relative(root, file) : file,
    cwd: root,
    pathSeparator: isWindows ? "\\" : "/",
  };
}

/**
 * Konfigurasi dari .vscode/launch.json. `report`: bila ada yang dilewati atau JSON-nya rusak, beri tahu
 * pengguna (toast + Debug Console) — sebelumnya dibuang diam-diam lalu F5 memakai konfigurasi otomatis.
 */
export async function launchJsonConfigs(report = false): Promise<LaunchConfig[]> {
  const root = getState().root;
  if (!root) return [];
  let content: string;
  try {
    content = (await api.readText(join(root, ".vscode/launch.json"))).content;
  } catch {
    return []; // tidak ada launch.json
  }
  const warn = (msg: string) => {
    if (!report) return;
    consoleLine("err", `launch.json: ${msg}`);
    toast(`launch.json: ${msg}`, "error", { label: tl("Buka launch.json"), run: () => void import("../app/actions").then((m) => m.openLaunchJson()) });
  };
  let j: { configurations?: LaunchConfig[] };
  try {
    j = parseJsonc(content) as { configurations?: LaunchConfig[] };
  } catch (e) {
    warn(tl("tidak bisa dibaca ({error}). Memakai konfigurasi otomatis.", { error: errMsg(e) }));
    return [];
  }
  const all = Array.isArray(j.configurations) ? j.configurations : [];
  const ok: LaunchConfig[] = [];
  const skipped: string[] = [];
  for (const c of all) {
    if (c && typeof c.type === "string" && typeof c.name === "string" && kindOf(c.type)) ok.push(c);
    else skipped.push(`${(c && typeof c.name === "string" && c.name) || "?"} (${(c && typeof c.type === "string" && c.type) || "?"})`);
  }
  if (skipped.length) warn(tl("konfigurasi dilewati karena tipe tidak didukung: {list}", { list: skipped.join(", ") }));
  return ok;
}

/** Konfigurasi otomatis dari berkas aktif (tanpa launch.json). */
export function autoConfig(): LaunchConfig | null {
  const tab = activeTab();
  if (tab?.kind !== "text") return null;
  const file = tab.id;
  const root = getState().root ?? dirname(file);
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const name = `Debug ${basename(file)}`;
  if (["js", "mjs", "cjs", "ts", "mts", "cts"].includes(ext))
    return { name, type: "pwa-node", request: "launch", program: file, cwd: root, console: "internalConsole", skipFiles: ["<node_internals>/**"] };
  if (ext === "py") return { name, type: "debugpy", request: "launch", program: file, cwd: root, console: "internalConsole", justMyCode: true };
  if (["c", "cpp", "cc", "cxx"].includes(ext)) return { name, type: "lldb-dap", request: "launch", program: "", cwd: root, __buildFile: file };
  if (ext === "go") return { name, type: "go", request: "launch", mode: "debug", program: file, cwd: root };
  return null;
}

// ---------------- Sesi ----------------

const clients = new Map<string, DapClient>();
let rootId: string | null = null;
let lastConfig: LaunchConfig | null = null;
let caps: Record<string, unknown> = {};

const activeClient = () => clients.get(dbg().active ?? "") ?? clients.get(rootId ?? "") ?? null;
const normPath = (p: unknown) => (typeof p === "string" ? (isWindows ? p.replace(/\\/g, "/").replace(/^[a-z]:/, (d) => d.toUpperCase()) : p) : null);

async function ensureAdapter(kind: Kind): Promise<boolean> {
  const st = await api.dapStatus(kind);
  if (st.available) return true;
  if (kind === "node" && st.installable) {
    if (!(await confirmDialog(tl("Pasang debugger JavaScript?"), tl("Alexel Studio akan mengunduh js-debug resmi dari GitHub Microsoft (sekitar 1,2 MB, checksum diperiksa). Cukup sekali."), tl("Pasang")))) return false;
    try {
      await api.dapInstallJsDebug();
      toast(tl("Debugger JavaScript terpasang."), "success");
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      return false;
    }
  }
  const what = kind === "python" ? "debugpy" : kind === "go" ? "Delve (dlv)" : "lldb-dap";
  if (st.install && (await confirmDialog(tl("{name} belum terpasang", { name: what }), `${tl("Pasang lewat terminal dengan perintah:")}\n${st.install}`, tl("Buka terminal")))) {
    const { runInTerminal } = await import("../app/run");
    await runInTerminal(st.install, tl("Pasang {name}", { name: what }));
  }
  return false;
}

function resetSessionState() {
  setDbg({ active: null, threadId: null, frames: [], frameId: null, scopes: [], vars: {}, stopReason: null, stoppedAt: null });
  showDebugLine(null);
}

/** Mulai debug (atau lanjutkan bila sedang berhenti). F5. */
export async function startDebug(config?: LaunchConfig) {
  if (isDebugging()) {
    if (dbg().status === "paused") return continueRun();
    return;
  }
  let cfg = config ?? (await launchJsonConfigs(true))[0] ?? autoConfig();
  if (!cfg) return toast(tl("Buka berkas JavaScript, TypeScript, Python, C/C++, atau Go, atau tambahkan .vscode/launch.json."));
  const kind = kindOf(cfg.type);
  if (!kind) return toast(tl("Tipe debug \"{type}\" belum didukung.", { type: cfg.type }));
  if (!(await ensureAdapter(kind))) return;
  for (const t of Object.values(getState().tabs)) if (t.dirty && t.kind === "text") await docs.saveDocument(t.id, { quiet: true });
  cfg = substitute(cfg, varsNow());
  if (typeof cfg.__buildFile === "string") {
    try {
      consoleLine("info", tl("Mengompilasi {file}…", { file: basename(cfg.__buildFile) }));
      cfg = { ...cfg, program: await api.dapBuild(cfg.__buildFile) };
    } catch (e) {
      consoleLine("err", errMsg(e));
      setLayout({ panel: true, panelTab: "debug" });
      return;
    }
  }
  lastConfig = config ?? null;
  setDbg({ status: "starting", name: cfg.name, console: [] });
  resetSessionState();
  setLayout({ panel: true, panelTab: "debug", sidebar: true, sideView: "run" });
  consoleLine("info", tl("Memulai {name}…", { name: cfg.name }));
  const id = `dbg-${Date.now().toString(36)}`;
  try {
    await api.dapStart(id, kind, getState().root ?? "");
  } catch (e) {
    setDbg({ status: "idle" });
    consoleLine("err", errMsg(e));
    return;
  }
  rootId = id;
  const c = new DapClient(id);
  clients.set(id, c);
  await runSession(c, kind, cfg, true);
}

async function runSession(c: DapClient, kind: Kind, cfg: LaunchConfig, isRoot: boolean) {
  wire(c, isRoot);
  try {
    caps = await c.request("initialize", {
      clientID: "alexel-studio",
      clientName: "Alexel Studio",
      adapterID: ADAPTER_TYPE[kind],
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: false,
      supportsRunInTerminalRequest: true,
      supportsStartDebuggingRequest: true,
      locale: "id",
    });
    const args = { ...cfg, type: kind === "node" && cfg.type === "node" ? "pwa-node" : cfg.type };
    delete (args as Record<string, unknown>).__buildFile;
    const initialized = c.once("initialized");
    const launched = c.request(cfg.request === "attach" ? "attach" : "launch", args);
    // Breakpoint & configurationDone setelah event initialized (sebelum respons launch pada sebagian adapter).
    await Promise.race([initialized, launched.then(() => initialized)]);
    await sendAllBreakpoints(c);
    await c.request("setExceptionBreakpoints", { filters: [] }).catch(() => {});
    if (caps.supportsConfigurationDoneRequest !== false) await c.request("configurationDone").catch(() => {});
    await launched;
    if (dbg().status === "starting") setDbg({ status: "running" });
  } catch (e) {
    // Dihentikan pengguna saat masih memulai: request yang tertunda ditolak, bukan error yang perlu ditampilkan.
    if (!c.stopped) consoleLine("err", errMsg(e));
    if (isRoot) await stopDebug();
  }
}

function wire(c: DapClient, isRoot: boolean) {
  c.on("output", (b) => {
    const cat = b.category ?? "console";
    if (cat === "telemetry") return;
    consoleLine(cat === "stderr" ? "err" : cat === "stdout" ? "out" : "info", String(b.output ?? "").replace(/\n$/, ""));
  });
  c.on("stopped", (b) => void onStopped(c, b));
  c.on("continued", () => {
    if (dbg().active === c.id) {
      setDbg({ status: "running", frames: [], scopes: [], vars: {}, stoppedAt: null });
      showDebugLine(null);
    }
  });
  c.on("breakpoint", (b) => {
    const bp = b.breakpoint;
    const path = normPath(bp?.source?.path);
    if (!path || !bp?.line) return;
    setDbg((s) => ({ breakpoints: { ...s.breakpoints, [path]: (s.breakpoints[path] ?? []).map((x) => (x.line === bp.line ? { ...x, verified: !!bp.verified } : x)) } }));
  });
  c.on("exited", (b) => consoleLine("info", tl("Program selesai (kode keluar {code}).", { code: b.exitCode ?? "?" })));
  c.on("terminated", () => {
    if (isRoot) void stopDebug();
    else {
      clients.delete(c.id);
      c.stop();
    }
  });
  c.onExit = (code, stderr) => {
    clients.delete(c.id);
    if (stderr.trim() && code) consoleLine("err", stderr.trim());
    if (isRoot && isDebugging()) void endDebug();
  };
  c.onReverse = async (command, args) => {
    if (command === "runInTerminal") {
      const { runInTerminal } = await import("../app/run");
      const q = (a: string) => (isWindows ? `'${a.replace(/'/g, "''")}'` : `'${a.replace(/'/g, "'\\''")}'`);
      const argv = (args.args ?? []) as string[];
      // cwd dan env dari adapter (js-debug `console: integratedTerminal`) ikut diteruskan ke proses.
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries((args.env ?? {}) as Record<string, unknown>)) if (typeof v === "string") env[k] = v;
      await runInTerminal((isWindows ? "& " : "") + argv.map(q).join(" "), args.title ?? "Debug", { cwd: typeof args.cwd === "string" ? args.cwd : undefined, env });
      return {};
    }
    if (command === "startDebugging") {
      const id = `dbg-${Date.now().toString(36)}-${clients.size}`;
      await api.dapStartChild(c.id, id);
      const child = new DapClient(id);
      clients.set(id, child);
      const conf = args.configuration ?? {};
      void runSession(child, "node", { name: conf.name ?? "anak", type: conf.type ?? "pwa-node", request: args.request === "attach" ? "attach" : "launch", ...conf }, false);
      return {};
    }
    throw new Error("Tidak didukung.");
  };
}

async function onStopped(c: DapClient, b: { reason?: string; threadId?: number; description?: string; text?: string }) {
  let threadId = b.threadId ?? null;
  if (threadId == null) {
    const t = await c.request<{ threads?: { id: number }[] }>("threads").catch(() => ({ threads: [] }));
    threadId = t.threads?.[0]?.id ?? 1;
  }
  setDbg({ status: "paused", active: c.id, threadId, stopReason: b.reason ?? null });
  const st = await c.request<{ stackFrames?: { id: number; name: string; line: number; column: number; source?: { path?: string } }[] }>("stackTrace", { threadId, startFrame: 0, levels: 60 }).catch(() => ({ stackFrames: [] }));
  const frames: Frame[] = (st.stackFrames ?? []).map((f) => ({ id: f.id, name: f.name, path: normPath(f.source?.path), line: f.line, col: f.column }));
  setDbg({ frames });
  const first = frames.find((f) => f.path) ?? frames[0];
  if (first) await selectFrame(first);
  const why: Record<string, string> = { breakpoint: "breakpoint", step: tl("langkah"), exception: "exception", pause: tl("dijeda"), entry: tl("awal program") };
  consoleLine("info", `${tl("Berhenti ({why})", { why: why[b.reason ?? ""] ?? b.reason ?? "?" })}${b.text ? `: ${b.text}` : ""}${first?.path ? ` ${tl("di {loc}", { loc: `${basename(first.path)}:${first.line}` })}` : ""}`);
  void refreshWatch();
}

export async function selectFrame(f: Frame) {
  const c = activeClient();
  if (!c) return;
  setDbg({ frameId: f.id, stoppedAt: f.path ? { path: f.path, line: f.line } : null });
  if (f.path) {
    const { openFile } = await import("../app/actions");
    await openFile(f.path, { line: f.line, col: f.col });
    showDebugLine(f.path, f.line);
  }
  const sc = await c.request<{ scopes?: { name: string; variablesReference: number; expensive?: boolean }[] }>("scopes", { frameId: f.id }).catch(() => ({ scopes: [] }));
  const scopes = (sc.scopes ?? []).map((s) => ({ name: s.name, ref: s.variablesReference, expensive: !!s.expensive }));
  setDbg({ scopes, vars: {} });
  for (const s of scopes.filter((x) => !x.expensive).slice(0, 2)) await loadVars(s.ref);
}

export async function loadVars(ref: number) {
  const c = activeClient();
  if (!c || !ref) return;
  const r = await c.request<{ variables?: { name: string; value: string; type?: string; variablesReference: number }[] }>("variables", { variablesReference: ref }).catch(() => ({ variables: [] }));
  setDbg((s) => ({ vars: { ...s.vars, [ref]: (r.variables ?? []).slice(0, 500).map((v) => ({ name: v.name, value: v.value, type: v.type, ref: v.variablesReference })) } }));
}

// ---------------- Kontrol ----------------

async function step(command: "continue" | "next" | "stepIn" | "stepOut") {
  const c = activeClient();
  const threadId = dbg().threadId;
  if (!c || dbg().status !== "paused" || threadId == null) return;
  setDbg({ status: "running", frames: [], scopes: [], vars: {}, stoppedAt: null });
  showDebugLine(null);
  await c.request(command, { threadId }).catch((e) => consoleLine("err", errMsg(e)));
}

export const continueRun = () => step("continue");
export const stepOver = () => step("next");
export const stepInto = () => step("stepIn");
export const stepOut = () => step("stepOut");

export async function pauseRun() {
  const c = activeClient();
  if (!c || dbg().status !== "running") return;
  const t = await c.request<{ threads?: { id: number }[] }>("threads").catch(() => ({ threads: [] }));
  await c.request("pause", { threadId: dbg().threadId ?? t.threads?.[0]?.id ?? 1 }).catch((e) => consoleLine("err", errMsg(e)));
}

async function endDebug() {
  for (const c of clients.values()) c.stop();
  clients.clear();
  rootId = null;
  resetSessionState();
  setDbg({ status: "idle" });
  consoleLine("info", tl("Sesi debug selesai."));
}

export async function stopDebug() {
  const root = clients.get(rootId ?? "");
  if (root && !root.closed) {
    await Promise.race([root.request("disconnect", { terminateDebuggee: true, restart: false }).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  }
  if (isDebugging() || clients.size) await endDebug();
}

export async function restartDebug() {
  const cfg = lastConfig;
  await stopDebug();
  await startDebug(cfg ?? undefined);
}

// ---------------- Breakpoint ----------------

function refreshBreakpointViews(path: string) {
  const list = dbg().breakpoints[path] ?? [];
  for (const g of [0, 1]) {
    const v = docs.viewOf(g);
    if (v && docs.shownPath(g) === path) v.dispatch({ effects: setBpsEffect.of(list) });
  }
}

async function sendBreakpoints(c: DapClient, path: string) {
  const list = dbg().breakpoints[path] ?? [];
  const r = await c
    .request<{ breakpoints?: { verified: boolean; line?: number; message?: string }[] }>("setBreakpoints", {
      source: { path, name: basename(path) },
      breakpoints: list.map((b) => ({ line: b.line, ...(b.condition ? { condition: b.condition } : {}) })),
      lines: list.map((b) => b.line),
    })
    .catch(() => null);
  if (!r?.breakpoints) return;
  setDbg((s) => ({ breakpoints: { ...s.breakpoints, [path]: (s.breakpoints[path] ?? []).map((b, i) => ({ ...b, verified: r.breakpoints?.[i]?.verified ?? b.verified, message: r.breakpoints?.[i]?.message })) } }));
  refreshBreakpointViews(path);
}

async function sendAllBreakpoints(c: DapClient) {
  for (const path of Object.keys(dbg().breakpoints)) if (dbg().breakpoints[path].length) await sendBreakpoints(c, path);
}

export function setBreakpoints(path: string, list: Breakpoint[]) {
  setDbg((s) => ({ breakpoints: { ...s.breakpoints, [path]: list.sort((a, b) => a.line - b.line) } }));
  refreshBreakpointViews(path);
  persistBreakpoints();
  for (const c of clients.values()) void sendBreakpoints(c, path);
}

export function toggleBreakpoint(path: string, line: number) {
  const list = dbg().breakpoints[path] ?? [];
  setBreakpoints(path, list.some((b) => b.line === line) ? list.filter((b) => b.line !== line) : [...list, { line }]);
}

/** F9: breakpoint di baris kursor berkas aktif. */
export function toggleBreakpointAtCursor() {
  const tab = activeTab();
  if (tab?.kind !== "text") return;
  toggleBreakpoint(tab.id, getState().cursor.line);
}

export function removeAllBreakpoints() {
  for (const p of Object.keys(dbg().breakpoints)) setBreakpoints(p, []);
}

const BP_KEY = "nozel.breakpoints";
function persistBreakpoints() {
  try {
    const root = getState().root;
    if (!root) return;
    const all = JSON.parse(localStorage.getItem(BP_KEY) || "{}");
    all[root] = Object.fromEntries(Object.entries(dbg().breakpoints).filter(([p, l]) => l.length && isInside(root, p)).map(([p, l]) => [p, l.map((b) => ({ line: b.line, condition: b.condition }))]));
    localStorage.setItem(BP_KEY, JSON.stringify(all));
  } catch {
    /* localStorage tidak tersedia */
  }
}

/** Muat breakpoint project saat folder dibuka. */
export function loadBreakpoints(root: string) {
  try {
    const all = JSON.parse(localStorage.getItem(BP_KEY) || "{}");
    setDbg({ breakpoints: all[root] ?? {} });
  } catch {
    setDbg({ breakpoints: {} });
  }
}

// ---------------- Sorotan baris ----------------

let shownLine: { path: string; line: number } | null = null;
function showDebugLine(path: string | null, line?: number) {
  shownLine = path && line ? { path, line } : null;
  for (const g of [0, 1]) {
    const v = docs.viewOf(g);
    if (!v) continue;
    const here = shownLine && docs.shownPath(g) === shownLine.path;
    v.dispatch({ effects: setDebugLineEffect.of(here ? shownLine!.line : null) });
  }
}

/** Dipanggil saat editor menampilkan berkas lain (supaya sorotan & breakpoint ikut). */
export function onEditorShown(group: number, path: string) {
  const v = docs.viewOf(group);
  if (!v) return;
  v.dispatch({ effects: [setBpsEffect.of(dbg().breakpoints[path] ?? []), setDebugLineEffect.of(shownLine?.path === path ? shownLine.line : null)] });
}

// ---------------- Evaluasi ----------------

export async function evaluateHover(expression: string): Promise<string | null> {
  const c = activeClient();
  if (!c || dbg().status !== "paused") return null;
  const r = await c.request<{ result: string }>("evaluate", { expression, frameId: dbg().frameId ?? undefined, context: "hover" }).catch(() => null);
  return r?.result ?? null;
}

export async function evaluateRepl(expression: string) {
  const expr = expression.trim();
  if (!expr) return;
  consoleLine("in", expr);
  const c = activeClient();
  if (!c) return consoleLine("err", tl("Tidak ada sesi debug."));
  try {
    const r = await c.request<{ result: string }>("evaluate", { expression: expr, frameId: dbg().frameId ?? undefined, context: "repl" });
    consoleLine("result", r.result);
  } catch (e) {
    consoleLine("err", errMsg(e));
  }
}

export async function refreshWatch() {
  const c = activeClient();
  const list = dbg().watch;
  if (!list.length) return;
  const next = await Promise.all(
    list.map(async (w) => {
      if (!c || dbg().status !== "paused") return { expr: w.expr };
      try {
        const r = await c.request<{ result: string }>("evaluate", { expression: w.expr, frameId: dbg().frameId ?? undefined, context: "watch" });
        return { expr: w.expr, value: r.result };
      } catch (e) {
        return { expr: w.expr, value: errMsg(e), error: true };
      }
    })
  );
  setDbg({ watch: next });
}

export function addWatch(expr: string) {
  if (!expr.trim()) return;
  setDbg((s) => ({ watch: [...s.watch, { expr: expr.trim() }] }));
  void refreshWatch();
}

export function removeWatch(i: number) {
  setDbg((s) => ({ watch: s.watch.filter((_, j) => j !== i) }));
}
