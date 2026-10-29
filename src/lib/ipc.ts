// Satu-satunya pintu ke backend (main process Electron, lewat preload `window.nozel`).
// Saat `npm run dev` dibuka di browser biasa, memakai backend tiruan (mock.ts)
// supaya UI tetap bisa dicoba. Mode tiruan TIDAK pernah aktif di build produksi.

import type { DbConnection, DbSchema, QueryResult } from "../../electron/db/types";
import type { HttpRequest, HttpResponse } from "../../electron/httpTypes";
import type {
  FoundProject,
  Branches,
  ClaudeInfo,
  ClaudeContent,
  AgentStatus,
  ClaudeSessionInfo,
  Commit,
  BlameInfo,
  GitOp,
  GitOpResult,
  StashEntry,
  TagEntry,
  FileEntry,
  Footprint,
  GitStatus,
  ImageFileData,
  ListeningPort,
  PowerStatus,
  ProjectOverview,
  RunTarget,
  SearchResult,
  Snapshot,
  TextFile,
  TodoItem,
} from "./types";

interface NozelBridge {
  platform: string;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, cb: (payload: unknown) => void) => () => void;
  pathForFile: (file: File) => string;
}

export const bridge: NozelBridge | null = typeof window !== "undefined" ? ((window as unknown as { nozel?: NozelBridge }).nozel ?? null) : null;
/** Berjalan di aplikasi desktop (Electron). */
export const isNative = !!bridge;
/** Nama lama, dipertahankan untuk kode yang sudah ada. */
export const isTauri = isNative;
export const isDemo = !isNative && import.meta.env.DEV;
/** OS tempat app berjalan ("darwin" | "win32" | "linux"); di browser ditebak dari userAgent. */
/** Mode dev saja: localStorage "nozel.fakePlatform" meniru OS lain untuk menguji tampilan Windows/Linux. */
const fakePlatform = (() => {
  if (!import.meta.env.DEV) return null;
  try {
    const v = localStorage.getItem("nozel.fakePlatform");
    return v === "win32" || v === "linux" || v === "darwin" ? v : null;
  } catch {
    return null;
  }
})();
export const platform: string =
  fakePlatform ?? bridge?.platform ?? (typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "darwin" : typeof navigator !== "undefined" && /Win/i.test(navigator.platform) ? "win32" : "linux");
export const isMac = platform === "darwin";
export const isWindows = platform === "win32";

type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;
type Listener = (payload: any) => void;

let mockHandlers: Record<string, Handler> | null = null;
const mockListeners = new Map<string, Set<Listener>>();

export function mockEmit(event: string, payload: unknown) {
  mockListeners.get(event)?.forEach((l) => l(payload));
}

async function loadMock() {
  if (!mockHandlers) {
    const m = await import("./mock");
    mockHandlers = m.createMockBackend(mockEmit);
  }
  return mockHandlers;
}

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (bridge) return (await bridge.invoke(cmd, args)) as T;
  if (!isDemo) throw new Error("Backend Alexel Studio tidak tersedia.");
  const handlers = await loadMock();
  const h = handlers[cmd];
  if (!h) throw new Error(`Belum didukung di mode pratinjau browser: ${cmd}`);
  return (await h(args)) as T;
}

export async function on<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  if (bridge) return bridge.on(event, (p) => cb(p as T));
  let set = mockListeners.get(event);
  if (!set) mockListeners.set(event, (set = new Set()));
  set.add(cb);
  return () => set!.delete(cb);
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const api = {
  // Berkas
  listDir: (dirPath: string) => call<FileEntry[]>("list_dir", { dirPath }),
  readText: (path: string) => call<TextFile>("read_file_text", { path }),
  readImage: (path: string) => call<ImageFileData>("read_file_image", { path }),
  readHead: (path: string, max?: number) => call<{ data: string; size: number }>("read_file_head", { path, max }),
  writeText: (path: string, content: string) => call<number>("write_file_text", { path, content }),
  writeBase64: (path: string, data: string) => call<void>("write_file_base64", { path, data }),
  mtime: (path: string) => call<number>("file_mtime", { path }),
  createFile: (path: string) => call<void>("create_file", { path }),
  createDir: (path: string) => call<void>("create_dir", { path }),
  trash: (path: string) => call<string | null>("delete_entry", { path }),
  restoreDeleted: (token: string, path: string) => call<void>("restore_deleted", { token, path }),
  rename: (oldPath: string, newPath: string) => call<void>("rename_entry", { oldPath, newPath }),
  duplicate: (path: string) => call<string>("duplicate_entry", { path }),
  reveal: (path: string) => call<void>("reveal_in_finder", { path }),

  // Time-travel
  historyList: (path: string) => call<Snapshot[]>("history_list", { path }),
  historyRead: (path: string, id: string) => call<string>("history_read", { path, id }),

  // Pencarian
  listFiles: (root: string) => call<string[]>("list_project_files", { root }),
  search: (root: string, query: string, o: { isRegex: boolean; caseSensitive: boolean; wholeWord: boolean; include?: string }) =>
    call<SearchResult>("search_project", { root, query, ...o, include: o.include || null }),
  replace: (paths: string[], query: string, replacement: string, o: { isRegex: boolean; caseSensitive: boolean; wholeWord: boolean }) =>
    call<number>("replace_in_files", { paths, query, replacement, ...o }),
  todos: (root: string) => call<TodoItem[]>("scan_todos", { root }),
  overview: (root: string) => call<ProjectOverview>("project_overview", { root }),

  // Git
  gitStatus: (projectDir: string) => call<GitStatus>("git_status", { projectDir }),
  gitStage: (projectDir: string, paths: string[]) => call<void>("git_stage", { projectDir, paths }),
  gitUnstage: (projectDir: string, paths: string[]) => call<void>("git_unstage", { projectDir, paths }),
  gitDiscard: (projectDir: string, paths: string[], untracked: string[]) => call<void>("git_discard", { projectDir, paths, untracked }),
  gitCommit: (projectDir: string, message: string, amend = false) => call<string>("git_commit", { projectDir, message, amend }),
  gitPush: (projectDir: string) => call<string>("git_push", { projectDir }),
  gitPull: (projectDir: string) => call<string>("git_pull", { projectDir }),
  gitLog: (projectDir: string, limit = 50, all = false) => call<Commit[]>("git_log", { projectDir, limit, all }),
  gitStashList: (projectDir: string) => call<StashEntry[]>("git_stash_list", { projectDir }),
  gitStashPush: (projectDir: string, message: string, untracked: boolean) => call<void>("git_stash_push", { projectDir, message, untracked }),
  gitStashApply: (projectDir: string, ref: string, pop: boolean) => call<GitOpResult>("git_stash_apply", { projectDir, ref, pop }),
  gitStashDrop: (projectDir: string, ref: string) => call<void>("git_stash_drop", { projectDir, ref }),
  gitFetch: (projectDir: string) => call<string>("git_fetch", { projectDir }),
  gitBranchDelete: (projectDir: string, name: string, force: boolean) => call<void>("git_branch_delete", { projectDir, name, force }),
  gitBranchRename: (projectDir: string, from: string, to: string) => call<void>("git_branch_rename", { projectDir, from, to }),
  gitRemoteBranches: (projectDir: string) => call<string[]>("git_remote_branches", { projectDir }),
  gitTags: (projectDir: string) => call<TagEntry[]>("git_tags", { projectDir }),
  gitTagCreate: (projectDir: string, name: string, target: string | null, message: string) => call<void>("git_tag_create", { projectDir, name, target, message }),
  gitTagDelete: (projectDir: string, name: string) => call<void>("git_tag_delete", { projectDir, name }),
  gitOpState: (projectDir: string) => call<{ op: GitOp | null; conflicts: number }>("git_op_state", { projectDir }),
  gitMerge: (projectDir: string, branch: string) => call<GitOpResult>("git_merge", { projectDir, branch }),
  gitRebase: (projectDir: string, onto: string) => call<GitOpResult>("git_rebase", { projectDir, onto }),
  gitCherryPick: (projectDir: string, sha: string) => call<GitOpResult>("git_cherry_pick", { projectDir, sha }),
  gitRevertCommit: (projectDir: string, sha: string) => call<GitOpResult>("git_revert_commit", { projectDir, sha }),
  gitOpContinue: (projectDir: string) => call<GitOpResult>("git_op_continue", { projectDir }),
  gitOpAbort: (projectDir: string) => call<void>("git_op_abort", { projectDir }),
  gitApplyPatch: (projectDir: string, patch: string, cached: boolean, reverse = false) => call<void>("git_apply_patch", { projectDir, patch, cached, reverse }),
  gitBlame: (path: string) => call<BlameInfo | null>("git_blame", { path }),
  gitShowCommit: (projectDir: string, sha: string) => call<{ text: string; truncated: boolean }>("git_show_commit", { projectDir, sha }),
  gitBranches: (projectDir: string) => call<Branches>("git_branches", { projectDir }),
  gitCheckout: (projectDir: string, branch: string, create = false, start: string | null = null) => call<void>("git_checkout", { projectDir, branch, create, start }),
  gitInit: (projectDir: string) => call<void>("git_init", { projectDir }),
  gitHead: (projectDir: string, path: string) => call<string | null>("git_head_content", { projectDir, path }),
  gitDiff: (projectDir: string, path: string, staged: boolean) => call<string>("git_diff_file", { projectDir, path, staged }),
  gitAutoCommit: (projectDir: string, path: string, push: boolean) => call<string>("git_auto_commit_file", { projectDir, path, push }),

  // Terminal
  ptySpawn: (cwd: string, cols: number, rows: number, command?: string, env?: Record<string, string>) =>
    call<number>("pty_spawn", { cwd, cols, rows, command: command ?? null, env: env ?? null }),
  ptyWrite: (id: number, data: string) => call<void>("pty_write", { id, data }),
  ptyResize: (id: number, cols: number, rows: number) => call<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: number) => call<void>("pty_kill", { id }),

  // Run
  commandForFile: (filePath: string, projectDir?: string | null) => call<RunTarget>("command_for_file", { filePath, projectDir: projectDir ?? null }),
  runTargets: (projectDir: string) => call<RunTarget[]>("detect_run_targets", { projectDir }),

  settingsPath: () => call<string>("settings_path"),
  pathKinds: (paths: string[]) => call<("file" | "dir" | null)[]>("path_kinds", { paths }),
  updateCheck: () => call<{ version: string | null; kind: "nsis" | "mac-zip" | "appimage" | null; manualReason: string | null; url: string | null }>("update_check"),
  updatePrepare: () => call<{ version: string; kind: string }>("update_prepare"),
  updateApply: () => call<void>("update_apply"),
  checkUpdate: () => call<{ repo: string | null; current: string; latest: string | null; url: string | null; newer: boolean }>("app_check_update"),
  appRepo: () => call<string | null>("app_repo"),
  gitClone: (url: string, parent: string) => call<string>("git_clone", { url, parent }),
  appInfo: () => call<{ version: string; electron: string; chrome?: string; node?: string; platform: string; arch?: string; osBuild?: string }>("app_info"),
  windowAction: (action: "fullscreen" | "minimize" | "maximize" | "close" | "devtools" | "zoomIn" | "zoomOut" | "zoomReset" | "quit") => call<void>("window_action", { action }),

  // Debug (DAP)
  dapStatus: (kind: string) => call<{ kind: string; available: boolean; installable?: boolean; install?: string | null; detail?: string | null }>("dap_status", { kind }),
  dapInstallJsDebug: () => call<string>("dap_install_jsdebug"),
  dapStart: (id: string, kind: string, cwd: string) => call<{ id: string }>("dap_start", { id, kind, cwd }),
  dapStartChild: (parent: string, id: string) => call<{ id: string }>("dap_start_child", { parent, id }),
  dapSend: (id: string, message: unknown) => call<void>("dap_send", { id, message }),
  dapStop: (id: string) => call<void>("dap_stop", { id }),
  dapBuild: (file: string) => call<string>("dap_build", { file }),

  // Claude
  claudeDetect: () => call<ClaudeInfo>("claude_detect"),
  claudeInline: (runId: string, projectDir: string, prompt: string, model: "fast" | "default" = "fast") => call<string>("claude_inline", { runId, projectDir, prompt, model }),
  agentStatus: (agent: string, cfg?: Record<string, unknown>) => call<AgentStatus>("agent_status", { agent, cfg: cfg ?? null }),
  agentLogin: (agent: string, cfg?: Record<string, unknown>) => call<string>("agent_login", { agent, cfg: cfg ?? null }),
  agentInstall: (agent: string) => call<{ version: string; target: string; binary: string }>("agent_install", { agent }),
  agentUninstall: (agent: string) => call<void>("agent_uninstall", { agent }),
  agentInstalled: (agent: string) => call<{ version: string; target: string } | null>("agent_installed", { agent }),
  agentSend: (agent: string, key: string, cfg: Record<string, unknown>, content: ClaudeContent[]) => call<void>("agent_send", { agent, key, cfg, content }),
  agentControl: (agent: string, key: string, msg: unknown) => call<boolean>("agent_control", { agent, key, msg }),
  agentClose: (agent: string, key: string) => call<void>("agent_close", { agent, key }),
  agentSessions: (agent: string, cwd: string) => call<ClaudeSessionInfo[]>("agent_sessions", { agent, cwd }),
  agentSessionLoad: (agent: string, cwd: string, id: string) => call<string[]>("agent_session_load", { agent, cwd, id }),
  agentOnce: (agent: string, runId: string, cwd: string, prompt: string) => call<string>("agent_once", { agent, runId, cwd, prompt }),
  agentOnceCancel: (runId: string) => call<void>("agent_once_cancel", { runId }),
  // HTTP client (lihat electron/http.ts)
  httpSend: (id: string, req: HttpRequest) => call<HttpResponse>("http_send", { id, req }),
  httpCancel: (id: string) => call<void>("http_cancel", { id }),
  httpSecrets: () => call<string[]>("http_secrets"),
  httpSecretSet: (name: string, value: string | null) => call<void>("http_secret_set", { name, value }),
  // Database (lihat electron/db): password tidak pernah dikirim balik ke renderer.
  dbList: () => call<(DbConnection & { connected: boolean })[]>("db_list"),
  dbSave: (conn: Partial<DbConnection> & { password?: string }) => call<DbConnection>("db_save", { conn }),
  dbRemove: (id: string) => call<void>("db_remove", { id }),
  dbTest: (conn: Partial<DbConnection> & { password?: string }) => call<string>("db_test", { conn }),
  dbDisconnect: (id: string) => call<void>("db_disconnect", { id }),
  dbSchema: (id: string) => call<DbSchema[]>("db_schema", { id }),
  dbSchemaText: (id: string, max?: number) => call<string>("db_schema_text", { id, max }),
  dbQuery: (id: string, text: string, o: { limit?: number; timeoutMs?: number; confirmed?: boolean } = {}) => call<QueryResult>("db_query", { id, text, ...o }),
  dbCancel: (id: string) => call<void>("db_cancel", { id }),
  dbBrowse: (id: string, o: DbBrowseOptions) => call<QueryResult & { total: number | null }>("db_browse", { id, o }),
  dbEdit: (id: string, edit: DbRowEdit) => call<{ affected: number }>("db_edit", { id, edit }),
  dbExport: (id: string, text: string, format: "csv" | "json", target: string) => call<{ rows: number }>("db_export", { id, text, format, target }),
  dbHistory: (id: string) => call<{ text: string; at: number; ms: number; rows?: number; ok: boolean; error?: string }[]>("db_history", { id }),
  dbDetect: (root: string) => call<DbDetected[]>("db_detect", { root }),
  dbAddDetected: (root: string, key: string) => call<DbConnection>("db_add_detected", { root, key }),
  gitCommitContext: (dir: string) => call<{ staged: boolean; files: string[]; diff: string; truncated: boolean; recent: string[] }>("git_commit_context", { dir }),
  agentWarm: (agent: string, key: string, cfg: Record<string, unknown>) => call<void>("agent_warm", { agent, key, cfg }),
  checkpointList: (root: string, chatKey: string) => call<{ turnId: string; time: number; files: { path: string; created: boolean }[] }[]>("checkpoint_list", { root, chatKey }),
  checkpointPre: (root: string, chatKey: string, path: string) => call<{ content: string | null; turnId: string } | null>("checkpoint_pre", { root, chatKey, path }),
  checkpointRestore: (root: string, chatKey: string, turnId: string, paths?: string[]) =>
    call<{ restored: string[]; removed: string[]; failed: string[] }>("checkpoint_restore", { root, chatKey, turnId, paths }),
  claudeCancel: (runId: string) => call<void>("claude_cancel", { runId }),

  // Sistem
  footprint: () => call<Footprint>("system_footprint"),
  discoverProjects: (parents: string[]) => call<FoundProject[]>("discover_projects", { parents }),
  power: () => call<PowerStatus>("power_status"),
  ports: () => call<ListeningPort[]>("list_ports"),
  kill: (pid: number, force = false) => call<void>("kill_process", { pid, force }),

  // Penyimpanan
  storeLoad: (key: string) => call<string | null>("store_load", { key }),
  storeSave: (key: string, json: string) => call<void>("store_save", { key, json }),

  // Watcher & pratinjau
  watch: (root: string, debounceMs: number, extra: string[] = []) => call<void>("watch_project", { root, debounceMs, extra }),
  unwatch: () => call<void>("unwatch_project"),
  previewRoot: (root: string | null) => call<void>("preview_set_root", { root }),
  previewOverride: (path: string, content: string | null) => call<void>("preview_set_override", { path, content }),
};

// ---------- Dialog, browser, jendela ----------

export async function pickFolder(): Promise<string | null> {
  if (bridge) return call<string | null>("dialog_open_folder");
  return isDemo ? "/Users/demo/nozel-project" : null;
}

export async function pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (bridge) return call<string | null>("dialog_open_file", { filters: filters ?? [] });
  return null;
}

export async function pickSavePath(defaultPath: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (bridge) return call<string | null>("dialog_save", { defaultPath, filters: filters ?? [] });
  return isDemo ? defaultPath : null;
}

export async function openExternal(url: string): Promise<void> {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  if (bridge) await call("open_external", { url });
  else window.open(url, "_blank", "noopener");
}

/** URL pratinjau untuk berkas lokal (dilayani protokol nozelpreview://). */
export function previewUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `nozelpreview://localhost${encoded.startsWith("/") ? encoded : "/" + encoded}`;
}

export const setWindowTitle = (title: string) => (bridge ? call("window_set_title", { title }).catch(() => {}) : Promise.resolve());
export const setTrafficLights = (y: number) => (bridge ? call("window_set_traffic_lights", { y }).catch(() => {}) : Promise.resolve());
export const setTitlebarOverlay = (o: { height: number; color: string; symbolColor: string }) => (bridge ? call("window_set_titlebar_overlay", o).catch(() => {}) : Promise.resolve());
export const confirmWindowClose = () => (bridge ? call("window_close_confirmed") : Promise.resolve());
export const pathForFile = (f: File): string | null => (bridge ? bridge.pathForFile(f) : null);

export interface DbBrowseOptions {
  schema: string | null;
  table: string;
  offset?: number;
  limit?: number;
  orderBy?: string | null;
  desc?: boolean;
  filters?: Record<string, string>;
}
export interface DbRowEdit {
  schema: string | null;
  table: string;
  key: Record<string, unknown>;
  values?: Record<string, unknown>;
  op: "update" | "insert" | "delete";
}
export interface DbDetected {
  key: string;
  name: string;
  kind: DbConnection["kind"];
  url?: string;
  file?: string;
  source: string;
  hasPassword: boolean;
}
