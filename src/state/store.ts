// State global aplikasi (zustand). Isi dokumen TIDAK disimpan di sini —
// itu ada di editor/documents.ts sebagai EditorState CodeMirror — supaya
// mengetik tidak memicu render ulang seluruh aplikasi.

import type { KepiMood } from "../components/CrabMascot";
import type { PenguinMood } from "../components/PenguinMascot";
import { create } from "zustand";
import type { DesignId } from "../design/designs";
import type { AgentId } from "../agents/registry";
import type { AgentStatus, ClaudeInfo, ClaudeModel, ClaudePermMode, FileEntry, GitStatus, PowerStatus, RunTarget, TodoItem } from "../lib/types";

let chatSeq = 0;
/** Kunci proses percakapan baru (huruf, angka, "-"). */
export const newChatKey = () => `c-${Date.now().toString(36)}-${++chatSeq}`;

export type PanelId = "terminal" | "problems" | "output" | "ports" | "todo" | "history" | "debug";
export type SideView = "files" | "search" | "git" | "todo" | "ext" | "outline" | "run";
export type RightView = "claude" | "git";
export type PreviewMode = "code" | "split" | "preview";

export interface Settings {
  design: DesignId;
  accent: string | null;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  powerMode: "auto" | "on" | "off";
  gitBot: "off" | "commit" | "push";
  /** Tampilkan isi lengkap yang akan dikirim sebelum setiap pesan. */
  claudeConfirm: boolean;
  /** Pengguna sudah menyetujui (sekali) bahwa pesan & konteks dikirim lewat Claude Code. */
  claudeConsent: boolean;
  claudeIncludeFile: boolean;
  /** Mode izin: tanya dulu, terima edit otomatis, atau hanya merencanakan. */
  claudeMode: ClaudePermMode;
  /** "default" = model bawaan akun, atau alias seperti "opus" / "sonnet". */
  claudeModel: string;
  /** "auto" = bawaan model, atau "low" … "max". */
  claudeEffort: string;
  /** Agen AI yang dipakai di panel (Claude Code, Codex, Gemini, atau agen ACP). */
  agent: AgentId;
  /** Pilihan model / effort / mode per agen selain Claude (Claude memakai claudeModel dsb.). */
  agentPrefs: Record<string, { model?: string; effort?: string; mode?: string }>;
  /** Perintah untuk "Agen ACP" kustom, mis. "my-agent --acp". */
  acpCommand: string;
  /** Shortcut buatan pengguna: id perintah → kombinasi ("" = dilepas). */
  keybindings: Record<string, string>;
  /** Tampilkan RAM & CPU aplikasi di status bar. */
  showResources: boolean;
  /** Model untuk ⌘K inline: "fast" (Sonnet, effort rendah) atau model bawaan Claude Code. */
  claudeInlineModel: "fast" | "default";
  terminalFontSize: number;
  /** off, setelah jeda mengetik, atau saat pindah tab / jendela kehilangan fokus. */
  autoSave: "off" | "delay" | "focus";
  confirmDelete: boolean;
  /** Tema warna dari ekstensi Open VSX, diterapkan di atas desain aktif. */
  extTheme: { ext: string; path: string; label: string; uiTheme: string } | null;
  /** Tema ikon berkas dari ekstensi Open VSX (mis. Material Icon Theme). */
  iconTheme: { ext: string; path: string; label: string } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  design: "studio",
  accent: null,
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  minimap: true,
  powerMode: "auto",
  gitBot: "off",
  claudeConfirm: false,
  claudeConsent: false,
  claudeIncludeFile: true,
  claudeMode: "default",
  claudeModel: "default",
  claudeEffort: "auto",
  agent: "claude",
  agentPrefs: {},
  acpCommand: "",
  keybindings: {},
  showResources: false,
  claudeInlineModel: "fast",
  terminalFontSize: 12,
  autoSave: "off",
  confirmDelete: true,
  extTheme: null,
  iconTheme: null,
};

export interface Layout {
  sidebar: boolean;
  sidebarW: number;
  sideView: SideView;
  panel: boolean;
  panelH: number;
  panelTab: PanelId;
  right: boolean;
  rightW: number;
  rightView: RightView;
}

export const DEFAULT_LAYOUTS: Record<DesignId, Layout> = {
  studio: { sidebar: true, sidebarW: 260, sideView: "files", panel: false, panelH: 240, panelTab: "terminal", right: true, rightW: 360, rightView: "claude" },
  "studio-light": { sidebar: true, sidebarW: 260, sideView: "files", panel: false, panelH: 240, panelTab: "terminal", right: true, rightW: 360, rightView: "claude" },
  aurora: { sidebar: true, sidebarW: 248, sideView: "files", panel: false, panelH: 220, panelTab: "terminal", right: true, rightW: 340, rightView: "claude" },
  zen: { sidebar: true, sidebarW: 232, sideView: "files", panel: false, panelH: 180, panelTab: "terminal", right: true, rightW: 340, rightView: "claude" },
  control: { sidebar: true, sidebarW: 252, sideView: "files", panel: false, panelH: 220, panelTab: "terminal", right: true, rightW: 340, rightView: "claude" },
  antartika: { sidebar: true, sidebarW: 236, sideView: "files", panel: false, panelH: 220, panelTab: "terminal", right: true, rightW: 340, rightView: "claude" },
  tuxedo: { sidebar: true, sidebarW: 224, sideView: "files", panel: false, panelH: 220, panelTab: "terminal", right: true, rightW: 340, rightView: "claude" },
  kawanan: { sidebar: true, sidebarW: 240, sideView: "files", panel: false, panelH: 190, panelTab: "terminal", right: true, rightW: 340, rightView: "claude" },
};

export type TabKind = "text" | "image" | "settings" | "dashboard" | "welcome";

export interface Tab {
  /** Path absolut, atau id khusus "nozel:settings". */
  id: string;
  name: string;
  kind: TabKind;
  dirty: boolean;
  lang: string;
  preview: PreviewMode;
  /** Berkas berubah di disk saat ada editan yang belum disimpan. */
  conflict?: boolean;
  /** Berkas dihapus dari luar. */
  missing?: boolean;
}

export interface Group {
  tabs: string[];
  active: string | null;
}

export interface Problem {
  line: number;
  col: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
}

export interface TermSession {
  key: string;
  ptyId: number | null;
  title: string;
  kind: "shell" | "run" | "claude";
  cwd: string;
  command?: string;
  status: "starting" | "running" | "exited";
  exitCode?: number | null;
  elapsedMs?: number;
  startedAt: number;
}

export interface ChatTool {
  /** id tool_use dari Claude. */
  useId?: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "ok" | "error" | "denied";
  result?: string;
}

export interface ChatPermission {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: unknown[];
  state: "pending" | "allowed" | "always" | "denied" | "expired";
  reason?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error" | "permission" | "todo" | "info";
  text: string;
  /** Ringkasan konteks yang ikut dikirim (untuk transparansi). */
  context?: string;
  time: number;
  meta?: string;
  tool?: ChatTool;
  perm?: ChatPermission;
  /** Jumlah gambar yang dilampirkan pengguna. */
  images?: number;
}

export interface ChatUsage {
  /** Total biaya setara API (USD) sepanjang percakapan. */
  cost: number;
  /** Token konteks pada giliran terakhir. */
  context: number;
  window: number;
}

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
  action?: { label: string; run: () => void };
}

export interface DialogRequest {
  kind: "confirm" | "prompt" | "choice";
  title: string;
  message?: string;
  /** Teks panjang monospace (mis. payload ke Claude). */
  detail?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
  validate?: (v: string) => string | null;
  choices?: { id: string; label: string; danger?: boolean }[];
  resolve: (v: string | boolean | null) => void;
}

export interface CompareRequest {
  title: string;
  /** Nama berkas untuk menentukan bahasa (warna sintaks). */
  filename?: string;
  leftLabel: string;
  rightLabel: string;
  left: string;
  right: string;
  acceptLabel?: string;
  onAccept?: () => void;
}

export interface PaletteState {
  open: boolean;
  /** "" = berkas, ">" = perintah, ":" = baris, "@" = simbol */
  initial: string;
}

interface State {
  ready: boolean;
  settings: Settings;
  layouts: Record<DesignId, Layout>;

  root: string | null;
  recents: string[];
  dirs: Record<string, FileEntry[]>;
  expanded: Record<string, true>;
  git: GitStatus | null;
  /** path absolut → kode status git (untuk dekorasi tree/tab) */
  gitMarks: Record<string, string>;
  /** folder yang berisi berkas berubah */
  gitDirs: Record<string, true>;
  runTargets: RunTarget[];
  todos: TodoItem[] | null;
  claude: ClaudeInfo | null;
  power: PowerStatus | null;

  tabs: Record<string, Tab>;
  groups: Group[];
  focusedGroup: number;
  cursor: { line: number; col: number; sel: number };
  problems: Record<string, Problem[]>;

  terminals: TermSession[];
  activeTerminal: string | null;

  chat: ChatMessage[];
  /** Kunci proses percakapan yang sedang menjawab (null = diam). */
  chatRunning: string | null;
  /** session_id Claude Code (untuk resume & riwayat). */
  chatSession: string | null;
  /** Kunci proses CLI percakapan aktif; diganti saat percakapan baru. */
  chatKey: string;
  chatUsage: ChatUsage | null;
  /** Model yang dilaporkan CLI (initialize) dan model yang sedang dipakai. */
  claudeModels: ClaudeModel[];
  claudeActiveModel: string | null;
  claudeCommands: { name: string; description: string }[];
  /** Status tiap agen AI (terpasang, login). */
  agentStatus: Record<string, AgentStatus>;
  /** Mode yang ditawarkan agen ACP sendiri (bila ada). */
  agentModes: { id: string; label: string; hint: string }[];

  palette: PaletteState;
  toasts: Toast[];
  dialog: DialogRequest | null;
  snapshotOpen: boolean;
  historyFor: string | null;
  compare: CompareRequest | null;
  penguinFlash: { mood: PenguinMood; until: number } | null;
  kepiFlash: { mood: KepiMood; until: number } | null;
  /** Claude inline (⌘K) sedang menulis perubahan. */
  inlineClaudeBusy: boolean;
  penguinTip: number;
}

export const useStore = create<State>(() => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  layouts: DEFAULT_LAYOUTS,

  root: null,
  recents: [],
  dirs: {},
  expanded: {},
  git: null,
  gitMarks: {},
  gitDirs: {},
  runTargets: [],
  todos: null,
  claude: null,
  power: null,

  tabs: {},
  groups: [{ tabs: [], active: null }],
  focusedGroup: 0,
  cursor: { line: 1, col: 1, sel: 0 },
  problems: {},

  terminals: [],
  activeTerminal: null,

  chat: [],
  chatRunning: null,
  chatSession: null,
  chatKey: newChatKey(),
  chatUsage: null,
  claudeModels: [],
  claudeActiveModel: null,
  claudeCommands: [],
  agentStatus: {},
  agentModes: [],

  palette: { open: false, initial: "" },
  toasts: [],
  dialog: null,
  snapshotOpen: false,
  historyFor: null,
  compare: null,
  penguinFlash: null,
  kepiFlash: null,
  inlineClaudeBusy: false,
  penguinTip: 0,
}));

export const getState = useStore.getState;
export const setState = useStore.setState;

export const useLayout = () => useStore((s) => s.layouts[s.settings.design]);

export function setLayout(patch: Partial<Layout>) {
  setState((s) => ({ layouts: { ...s.layouts, [s.settings.design]: { ...s.layouts[s.settings.design], ...patch } } }));
}

export function currentLayout(): Layout {
  const s = getState();
  return s.layouts[s.settings.design];
}

export function activeTabId(s: State = getState()): string | null {
  return s.groups[s.focusedGroup]?.active ?? s.groups[0]?.active ?? null;
}

export function activeTab(s: State = getState()): Tab | null {
  const id = activeTabId(s);
  return id ? s.tabs[id] ?? null : null;
}

export const useActiveTab = () => useStore((s) => activeTab(s));

/** Mode hemat daya aktif? (manual, atau otomatis saat pakai baterai / Low Power Mode) */
export function isSaver(s: State = getState()): boolean {
  if (s.settings.powerMode === "on") return true;
  if (s.settings.powerMode === "off") return false;
  return !!(s.power?.on_battery || s.power?.low_power_mode);
}
export const useSaver = () => useStore((s) => isSaver(s));

let toastId = 1;
export function toast(text: string, kind: Toast["kind"] = "info", action?: Toast["action"]) {
  const id = toastId++;
  if (kind === "error") void import("../app/output").then((m) => m.logOutput("Alexel Studio", text));
  setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text, action }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), action ? 9000 : kind === "error" ? 7000 : 4000);
}

/** Toast yang tetap tampil sampai fungsi yang dikembalikan dipanggil (untuk proses panjang). */
export function stickyToast(text: string): () => void {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind: "info", text }] }));
  return () => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function ask(req: Omit<DialogRequest, "resolve">): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    getState().dialog?.resolve(null);
    setState({ dialog: { ...req, resolve } });
  });
}

export async function confirmDialog(title: string, message: string, okLabel = "Lanjut", danger = false): Promise<boolean> {
  return (await ask({ kind: "confirm", title, message, okLabel, danger })) === true;
}

export async function promptDialog(title: string, opts: { message?: string; defaultValue?: string; placeholder?: string; okLabel?: string; validate?: (v: string) => string | null } = {}): Promise<string | null> {
  const r = await ask({ kind: "prompt", title, ...opts });
  return typeof r === "string" ? r : null;
}
