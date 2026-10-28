// Tipe data yang dikirim main process (lihat electron/*.ts).

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size?: number | null;
  extension?: string | null;
}

export interface TextFile {
  content: string;
  mtime_ms: number;
  eol: "lf" | "crlf";
}

export interface ImageFileData {
  data_url: string;
  size_bytes: number;
  format: string;
}

export interface Snapshot {
  id: string;
  time_ms: number;
  size: number;
  lines: number;
}

export interface SearchMatch {
  path: string;
  rel: string;
  line: number;
  col: number;
  len: number;
  text: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  files_searched: number;
  truncated: boolean;
}

export interface TodoItem {
  path: string;
  rel: string;
  line: number;
  tag: string;
  text: string;
}

export interface LangStat {
  ext: string;
  files: number;
  bytes: number;
}

export interface ProjectOverview {
  name: string;
  file_count: number;
  total_bytes: number;
  languages: LangStat[];
  last_modified_ms: number;
  last_modified_file?: string | null;
  truncated: boolean;
}

export interface GitFile {
  path: string;
  orig_path?: string | null;
  xy: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface GitStatus {
  is_repo: boolean;
  root: string;
  branch: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}

export interface Commit {
  sha: string;
  short: string;
  subject: string;
  author: string;
  time_s: number;
  refs: string;
  /** Sha parent (kosong = commit pertama, >1 = merge). */
  parents?: string[];
}

export interface StashEntry {
  ref: string;
  message: string;
  time_s: number;
}

export interface TagEntry {
  name: string;
  sha: string;
  subject: string;
}

export type GitOp = "merge" | "rebase" | "cherry-pick" | "revert";

export interface GitOpResult {
  ok: boolean;
  conflicts: boolean;
  output: string;
}

export interface BlameInfo {
  commits: Record<string, { sha: string; author: string; time_s: number; summary: string }>;
  /** sha per baris (indeks 0 = baris 1); sha nol = belum di-commit. */
  lines: string[];
}

export interface Branches {
  current: string;
  local: string[];
}

export interface RunTarget {
  id: string;
  label: string;
  command: string;
  cwd: string;
  kind: string;
  detail: string;
  /** Program yang dibutuhkan belum terpasang (Run ditahan). */
  missing?: { tool: string; install: string };
}

export interface ClaudeInfo {
  installed: boolean;
  path?: string | null;
  version?: string | null;
  error?: string | null;
  /** null = tidak diketahui (CLI lama). */
  loggedIn?: boolean | null;
  /** "pro", "max", … */
  plan?: string | null;
  /** Pilihan yang diterima CLI (dari --help). */
  permissionModes?: string[];
  efforts?: string[];
}

/** Status satu agen AI (lihat electron/agents). */
export interface AgentStatus {
  installed: boolean;
  path?: string | null;
  version?: string | null;
  loggedIn?: boolean | null;
  plan?: string | null;
  permissionModes?: string[];
  efforts?: string[];
  source?: "system" | "extension" | null;
  error?: string | null;
}

export type ClaudePermMode = "default" | "acceptEdits" | "plan" | "auto" | "bypassPermissions";

export interface ClaudeSessionCfg {
  cwd: string;
  model?: string | null;
  effort?: string | null;
  mode: ClaudePermMode;
  resume?: string | null;
  ultracode?: boolean;
  allowDangerous?: boolean;
}

export type ClaudeContent = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ClaudeSessionInfo {
  id: string;
  title: string;
  time_ms: number;
  messages: number;
}

/** Model dari balasan initialize CLI. */
export interface ClaudeModel {
  value: string;
  displayName: string;
  description?: string;
  /** false = model tidak punya pengaturan effort (kontrol disembunyikan). */
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  supportsAutoMode?: boolean;
  supportsFastMode?: boolean;
}

export interface Footprint {
  /** Total RAM semua proses Alexel Studio (main + renderer + GPU + helper), dalam MB. */
  core_mb: number;
  processes?: number;
  cpu_percent: number;
  uptime_s: number;
}

export interface PowerStatus {
  on_battery: boolean;
  percent?: number | null;
  charging: boolean;
  low_power_mode: boolean;
}

export interface ListeningPort {
  pid: number;
  process: string;
  port: number;
  address: string;
  command: string;
}

export interface FoundProject {
  path: string;
  name: string;
  kind: string;
  mtimeMs: number;
  git: boolean;
}
