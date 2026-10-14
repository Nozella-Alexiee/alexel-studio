// Registry perintah: satu sumber untuk command palette dan shortcut keyboard.

import { DESIGNS } from "../design/designs";
import * as docs from "../editor/documents";
import { getState, setState, activeTab, setLayout } from "../state/store";
import * as A from "./actions";
import { openClaudeInteractive, openShell, runActiveFile } from "./run";

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Kombinasi tombol, format "Mod+Shift+P". Mod = ⌘. */
  keys?: string;
  run: () => void | Promise<void>;
  when?: () => boolean;
  /** Alias shortcut: tidak tampil di palette. */
  hidden?: boolean;
}

const hasTab = () => !!activeTab();
const hasText = () => activeTab()?.kind === "text";
const hasRoot = () => !!getState().root;

export function openPalette(initial = "") {
  setState({ palette: { open: true, initial } });
}

const claude = () => import("../claude/claude");

export const COMMANDS: Command[] = [
  { id: "quickOpen", label: "Buka berkas…", group: "Berkas", keys: "Mod+P", run: () => openPalette("") },
  { id: "palette", label: "Palette perintah", group: "Umum", keys: "Mod+K", run: () => openPalette(">") },
  { id: "palette2", label: "Palette perintah", group: "Umum", keys: "Mod+Shift+P", run: () => openPalette(">"), hidden: true },
  { id: "gotoLine", label: "Pergi ke baris…", group: "Editor", keys: "Ctrl+G", run: () => openPalette(":"), when: hasText },
  { id: "gotoSymbol", label: "Pergi ke simbol di berkas…", group: "Editor", keys: "Mod+Shift+O", run: () => openPalette("@"), when: hasText },
  { id: "openFolder", label: "Buka folder…", group: "Berkas", keys: "Mod+O", run: A.openProjectDialog },
  { id: "closeFolder", label: "Tutup folder", group: "Berkas", run: A.closeProject, when: hasRoot },
  { id: "newFile", label: "Berkas baru", group: "Berkas", keys: "Mod+N", run: () => A.newFile(activeTab()?.kind === "text" ? activeTab()!.id : null) },
  { id: "newFolder", label: "Folder baru", group: "Berkas", run: () => A.newFolder() },
  { id: "save", label: "Simpan", group: "Berkas", keys: "Mod+S", run: A.saveActive, when: hasText },
  { id: "saveAll", label: "Simpan semua", group: "Berkas", keys: "Mod+Alt+S", run: A.saveAll },
  { id: "closeTab", label: "Tutup tab", group: "Berkas", keys: "Mod+W", run: () => void A.closeTab(getState().groups[getState().focusedGroup]?.active ?? ""), when: hasTab },
  { id: "closeAll", label: "Tutup semua tab", group: "Berkas", run: () => void A.closeAllTabs() },
  { id: "revealFile", label: "Tampilkan berkas aktif di Explorer", group: "Berkas", run: () => A.revealInTree(activeTab()!.id), when: hasText },
  { id: "nextTab", label: "Tab berikutnya", group: "Editor", keys: "Ctrl+Tab", run: () => A.cycleTab(1) },
  { id: "prevTab", label: "Tab sebelumnya", group: "Editor", keys: "Ctrl+Shift+Tab", run: () => A.cycleTab(-1) },
  { id: "nextTab2", label: "Tab berikutnya", group: "Editor", keys: "Mod+Shift+]", run: () => A.cycleTab(1), hidden: true },
  { id: "prevTab2", label: "Tab sebelumnya", group: "Editor", keys: "Mod+Shift+[", run: () => A.cycleTab(-1), hidden: true },
  { id: "split", label: "Belah / gabung editor", group: "Editor", keys: "Mod+\\", run: A.splitEditor },
  { id: "focusLeft", label: "Fokus editor kiri", group: "Editor", keys: "Mod+1", run: () => { A.focusGroup(0); docs.focusEditor(0); } },
  { id: "focusRight", label: "Fokus editor kanan", group: "Editor", keys: "Mod+2", run: () => { A.focusGroup(1); docs.focusEditor(1); } },
  { id: "fontUp", label: "Perbesar huruf editor", group: "Editor", keys: "Mod+=", run: () => A.updateSettings({ fontSize: Math.min(28, getState().settings.fontSize + 1) }) },
  { id: "fontDown", label: "Perkecil huruf editor", group: "Editor", keys: "Mod+-", run: () => A.updateSettings({ fontSize: Math.max(9, getState().settings.fontSize - 1) }) },
  { id: "wrap", label: "Bungkus baris panjang (word wrap)", group: "Editor", keys: "Alt+Z", run: () => A.updateSettings({ wordWrap: !getState().settings.wordWrap }) },
  { id: "minimap", label: "Tampilkan/sembunyikan minimap", group: "Editor", run: () => A.updateSettings({ minimap: !getState().settings.minimap }) },
  { id: "snapshot", label: "Snapshot kode jadi gambar", group: "Editor", keys: "Mod+Shift+2", run: () => setState({ snapshotOpen: true }), when: hasText },

  { id: "sidebar", label: "Tampilkan/sembunyikan sidebar", group: "Tampilan", keys: "Mod+B", run: () => A.toggleSidebar() },
  { id: "explorer", label: "Explorer", group: "Tampilan", keys: "Mod+Shift+E", run: () => A.toggleSidebar("files") },
  { id: "search", label: "Cari di seluruh project", group: "Tampilan", keys: "Mod+Shift+F", run: () => { setLayout({ sidebar: true, sideView: "search" }); requestAnimationFrame(() => document.getElementById("search-input")?.focus()); } },
  { id: "git", label: "Source control (Git)", group: "Tampilan", keys: "Ctrl+Shift+G", run: () => (getState().settings.design === "control" ? A.toggleRight("git") : A.toggleSidebar("git")) },
  { id: "todo", label: "Papan TODO", group: "Tampilan", run: () => A.togglePanel("todo") },
  { id: "panel", label: "Tampilkan/sembunyikan panel bawah", group: "Tampilan", keys: "Mod+J", run: () => A.togglePanel() },
  { id: "terminal", label: "Terminal", group: "Terminal", keys: "Ctrl+`", run: async () => { const s = getState(); if (!s.terminals.length) await openShell(); else A.togglePanel("terminal"); } },
  { id: "newTerminal", label: "Terminal baru", group: "Terminal", keys: "Ctrl+Shift+`", run: openShell },
  { id: "problems", label: "Masalah (error & peringatan)", group: "Tampilan", keys: "Mod+Shift+M", run: () => A.togglePanel("problems") },
  { id: "ports", label: "Port & proses yang berjalan", group: "Tampilan", run: () => A.togglePanel("ports") },
  { id: "history", label: "Time-travel berkas ini", group: "Editor", keys: "Mod+Shift+H", run: () => { setState({ historyFor: activeTab()?.id ?? null }); A.togglePanel("history"); }, when: hasText },
  { id: "dashboard", label: "Dashboard project", group: "Tampilan", run: () => { const g = getState().groups[getState().focusedGroup]; if (g) setState({ groups: getState().groups.map((x, i) => (i === getState().focusedGroup ? { ...x, active: null } : x)) }); } },

  { id: "run", label: "Jalankan berkas aktif", group: "Run", keys: "Mod+R", run: runActiveFile, when: hasText },
  { id: "run2", label: "Jalankan berkas aktif", group: "Run", keys: "F5", run: runActiveFile, hidden: true },
  { id: "runTarget", label: "Smart Run: pilih target…", group: "Run", run: () => openPalette("!"), when: hasRoot },

  { id: "claude", label: "Panel Claude", group: "Claude", keys: "Mod+Alt+B", run: () => A.toggleRight("claude") },
  { id: "askClaude", label: "Tanya Claude", group: "Claude", keys: "Mod+L", run: () => { setLayout({ right: true, rightView: "claude" }); requestAnimationFrame(() => document.getElementById("claude-input")?.focus()); } },
  { id: "explainSel", label: "Claude: jelaskan seleksi", group: "Claude", run: () => void claude().then((m) => m.explainSelection()), when: hasText },
  { id: "claudeTerm", label: "Claude interaktif di terminal", group: "Claude", run: openClaudeInteractive },
  { id: "newChat", label: "Claude: percakapan baru", group: "Claude", run: () => void claude().then((m) => m.newConversation()) },

  { id: "settings", label: "Pengaturan", group: "Umum", keys: "Mod+,", run: () => A.openSettings() },
  { id: "cycleDesign", label: "Ganti ke desain berikutnya", group: "Desain", keys: "Ctrl+Mod+T", run: A.cycleDesign },
  ...DESIGNS.map((d) => ({ id: `design:${d.id}`, label: `Desain: ${d.name}`, group: "Desain", run: () => A.setDesign(d.id) })),
  { id: "resetLayout", label: "Kembalikan tata letak desain ini", group: "Desain", run: A.resetLayout },
  { id: "power", label: "Mode hemat daya: ganti (otomatis / nyala / mati)", group: "Umum", run: () => { const m = getState().settings.powerMode; A.updateSettings({ powerMode: m === "auto" ? "on" : m === "on" ? "off" : "auto" }); } },
  { id: "refresh", label: "Muat ulang tree & status git", group: "Umum", run: () => { void A.refreshTree(); void A.refreshGit(); } },
];

// ---------------- Keybinding ----------------

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (e.code === "Backquote") k = "`";
  else if (e.code === "BracketLeft") k = "[";
  else if (e.code === "BracketRight") k = "]";
  else if (e.code === "Backslash") k = "\\";
  else if (e.code === "Equal") k = "=";
  else if (e.code === "Minus") k = "-";
  else if (e.code === "Comma") k = ",";
  else if (e.code.startsWith("Digit")) k = e.code.slice(5);
  else if (e.code.startsWith("Key")) k = e.code.slice(3);
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}

const byKeys = new Map<string, Command>();
for (const c of COMMANDS) if (c.keys) byKeys.set(c.keys, c);

/** Teks shortcut untuk ditampilkan: "Mod+Shift+P" → "⌘⇧P". */
export function prettyKeys(keys?: string): string {
  if (!keys) return "";
  return keys
    .split("+")
    .map((k) => ({ Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃", Tab: "⇥" })[k] ?? k)
    .join("");
}

/** Global key handler (fase capture, supaya didahulukan dari CodeMirror). */
export function handleGlobalKey(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (!(e.metaKey || e.ctrlKey || e.altKey || e.key === "F5")) return;
  const s = getState();
  if (s.dialog || s.compare) return; // dialog menangani tombolnya sendiri
  const cmd = byKeys.get(comboOf(e));
  if (!cmd) return;
  // Di kolom input, biarkan ⌘A/⌘C dsb. Hanya perintah global yang ditangkap.
  const el = e.target as HTMLElement | null;
  const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !el.classList.contains("xterm-helper-textarea");
  if (inField && ["save", "closeTab", "gotoLine", "wrap", "focusLeft", "focusRight", "fontUp", "fontDown", "snapshot"].includes(cmd.id)) return;
  if (s.palette.open && cmd.id !== "palette" && cmd.id !== "quickOpen") return;
  e.preventDefault();
  e.stopPropagation();
  void cmd.run();
}

export const visibleCommands = () => COMMANDS.filter((c) => !c.hidden && (!c.when || c.when()));
