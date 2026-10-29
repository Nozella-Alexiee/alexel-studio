// Registry perintah: satu sumber untuk command palette dan shortcut keyboard.

import { DESIGNS, designById } from "../design/designs";
import * as docs from "../editor/documents";
import { api, isMac } from "../lib/ipc";
import { normalizeKeys, prettyKeys } from "../lib/keys";

export { normalizeKeys, prettyKeys };
import { getState, setState, activeTab, setLayout } from "../state/store";
import * as A from "./actions";
import * as E from "./editorCommands";
import { isDebugging } from "../debug/state";
import { openClaudeInteractive, openShell, runActiveFile, toggleTerminal } from "./run";
import { tl } from "../i18n";

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
  /** Shortcut yang ditangani editor sendiri (CodeMirror); hanya ditampilkan di menu & palette. */
  shownKeys?: string;
}

/** Shortcut yang ditampilkan untuk sebuah perintah (setelah penggantian pengguna). */
export const keysOf = (c: Command) => c.keys ?? c.shownKeys;

const hasTab = () => !!activeTab();
const hasText = () => activeTab()?.kind === "text";
const hasRoot = () => !!getState().root;

export function openPalette(initial = "") {
  setState({ palette: { open: true, initial } });
}

const claude = () => import("../claude/claude");
const dbgm = () => import("../debug/debug");
const debugging = () => isDebugging();

/** Buka panel Claude dan fokus ke kotak pesan (⌘⎋ / Ctrl+Esc, seperti ekstensi VS Code). */
function focusClaude() {
  setLayout({ right: true, rightView: "claude" });
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("claude-input")?.focus()));
}

export const COMMANDS: Command[] = [
  { id: "quickOpen", label: tl("Buka berkas…"), group: tl("Berkas"), keys: "Mod+P", run: () => openPalette("") },
  { id: "palette", label: tl("Palette perintah"), group: tl("Umum"), keys: "Mod+Shift+P", run: () => openPalette(">") },
  { id: "palette2", label: tl("Palette perintah"), group: tl("Umum"), keys: "F1", run: () => openPalette(">"), hidden: true },
  { id: "http.new", label: tl("API: request HTTP baru"), group: "API", run: () => void import("../http/state").then((m) => m.openBuilder()) },
  { id: "http.curl", label: tl("API: impor dari cURL…"), group: "API", run: () => void import("../http/ApiPanel").then((m) => m.importCurlToBuilder()) },
  { id: "http.fromCode", label: tl("API: buat request dari kode ini (AI)"), group: "API", run: () => void import("../http/ai").then((m) => m.requestsFromCode()), when: () => activeTab()?.kind === "text" },
  { id: "http.focus", label: tl("API: tampilkan panel"), group: "API", run: () => A.toggleSidebar("api") },
  { id: "docker.focus", label: tl("Docker: tampilkan panel"), group: "Docker", run: () => A.toggleSidebar("docker") },
  { id: "env.table", label: tl(".env: edit sebagai tabel"), group: ".env", run: () => void import("../env/EnvTab").then((m) => m.openEnvTab(activeTab()!.id)), when: () => !!activeTab() && /(^|[\\/])\.env(\.[\w.-]+)?$/.test(activeTab()!.id) },
  { id: "db.focus", label: tl("Database: tampilkan panel"), group: "Database", run: () => A.toggleSidebar("db") },
  { id: "db.newConnection", label: tl("Database: koneksi baru…"), group: "Database", run: () => void import("../db/state").then((m) => (A.toggleSidebar("db"), m.useDb.setState({ editing: {} }))) },
  { id: "db.results", label: tl("Database: hasil query"), group: "Database", run: () => A.togglePanel("db") },
  { id: "tour", label: tl("Tur singkat Alexel Studio"), group: tl("Bantuan"), run: () => void import("../components/Tour").then((m) => m.startTour()) },
  { id: "reopenTab", label: tl("Buka lagi tab yang ditutup"), group: tl("Berkas"), keys: "Mod+Shift+T", run: () => void A.reopenClosedTab() },
  { id: "inlineClaude", label: tl("AI: ubah seleksi di tempat"), group: tl("Agen AI"), run: () => void openInlineClaude(), when: () => !!activeTab() && activeTab()!.kind === "text" },
  { id: "gotoLine", label: tl("Pergi ke baris…"), group: "Editor", keys: "Ctrl+G", run: () => openPalette(":"), when: hasText },
  { id: "gotoSymbol", label: tl("Pergi ke simbol di berkas…"), group: "Editor", keys: "Mod+Shift+O", run: () => openPalette("@"), when: hasText },
  { id: "workspaceSymbol", label: tl("Pergi ke simbol di project…"), group: "Editor", keys: "Mod+T", run: () => openPalette("#"), when: hasRoot },
  { id: "undo", label: tl("Urungkan"), group: "Edit", shownKeys: "Mod+Z", run: () => E.editAction("undo") },
  { id: "redo", label: tl("Ulangi"), group: "Edit", shownKeys: "Mod+Shift+Z", run: () => E.editAction("redo") },
  { id: "cut", label: tl("Potong"), group: "Edit", shownKeys: "Mod+X", run: () => E.editAction("cut"), hidden: true },
  { id: "copy", label: tl("Salin"), group: "Edit", shownKeys: "Mod+C", run: () => E.editAction("copy"), hidden: true },
  { id: "paste", label: tl("Tempel"), group: "Edit", shownKeys: "Mod+V", run: () => E.editAction("paste"), hidden: true },
  { id: "selectAll", label: tl("Pilih semua"), group: tl("Seleksi"), shownKeys: "Mod+A", run: () => E.editAction("selectAll") },
  { id: "find", label: tl("Cari di berkas"), group: "Edit", shownKeys: "Mod+F", run: E.find, when: hasText },
  { id: "replace", label: tl("Ganti di berkas"), group: "Edit", keys: "Mod+Alt+F", run: E.replace, when: hasText },
  { id: "comment", label: tl("Komentar / batal komentar baris"), group: "Edit", shownKeys: "Mod+/", run: E.comment, when: hasText },
  { id: "format", label: tl("Rapikan dokumen"), group: "Edit", shownKeys: "Shift+Alt+F", run: E.format, when: hasText },
  { id: "definition", label: tl("Pergi ke definisi"), group: tl("Pergi"), shownKeys: "F12", run: E.definition, when: hasText },
  { id: "references", label: tl("Cari semua referensi"), group: tl("Pergi"), shownKeys: "Shift+F12", run: E.references, when: hasText },
  { id: "rename", label: tl("Ganti nama simbol"), group: "Edit", shownKeys: "F2", run: E.rename, when: hasText },
  { id: "copyLineDown", label: tl("Salin baris ke bawah"), group: tl("Seleksi"), shownKeys: "Shift+Alt+Down", run: E.lineDown, when: hasText },
  { id: "copyLineUp", label: tl("Salin baris ke atas"), group: tl("Seleksi"), shownKeys: "Shift+Alt+Up", run: E.lineUp, when: hasText },
  { id: "moveLineDown", label: tl("Pindahkan baris ke bawah"), group: tl("Seleksi"), shownKeys: "Alt+Down", run: E.moveDown, when: hasText },
  { id: "moveLineUp", label: tl("Pindahkan baris ke atas"), group: tl("Seleksi"), shownKeys: "Alt+Up", run: E.moveUp, when: hasText },
  { id: "cursorAbove", label: tl("Tambah kursor di atas"), group: tl("Seleksi"), shownKeys: "Mod+Alt+Up", run: E.cursorAbove, when: hasText },
  { id: "cursorBelow", label: tl("Tambah kursor di bawah"), group: tl("Seleksi"), shownKeys: "Mod+Alt+Down", run: E.cursorBelow, when: hasText },
  { id: "nextOccurrence", label: tl("Tambah kemunculan berikutnya ke seleksi"), group: tl("Seleksi"), shownKeys: "Mod+D", run: E.nextOccurrence, when: hasText },
  { id: "allOccurrences", label: tl("Pilih semua kemunculan"), group: tl("Seleksi"), shownKeys: "Mod+Shift+L", run: E.allOccurrences, when: hasText },
  { id: "expandSelection", label: tl("Perluas seleksi"), group: tl("Seleksi"), shownKeys: "Ctrl+Shift+Right", run: E.expandSelection, when: hasText },
  { id: "selectLine", label: tl("Pilih baris"), group: tl("Seleksi"), run: E.selectCurrentLine, when: hasText },
  { id: "openFolder", label: tl("Buka folder…"), group: tl("Berkas"), keys: "Mod+O", run: A.openProjectDialog },
  { id: "openWorkspace", label: tl("Buka workspace (.code-workspace)…"), group: tl("Berkas"), run: () => void A.openWorkspaceFile() },
  { id: "addWorkspaceFolder", label: tl("Tambah folder ke workspace…"), group: tl("Berkas"), run: () => void A.addWorkspaceFolder(), when: () => !!getState().root },
  { id: "saveWorkspaceAs", label: tl("Simpan workspace sebagai…"), group: tl("Berkas"), run: () => void A.saveWorkspaceAs(), when: () => !!getState().root },
  { id: "closeFolder", label: tl("Tutup folder"), group: tl("Berkas"), run: A.closeProject, when: hasRoot },
  { id: "cloneRepo", label: tl("Clone repositori Git…"), group: tl("Berkas"), run: () => void A.cloneRepo() },
  { id: "autoSave", label: tl("Simpan otomatis"), group: tl("Berkas"), run: () => A.updateSettings({ autoSave: getState().settings.autoSave === "off" ? "delay" : "off" }) },
  { id: "quit", label: tl("Keluar"), group: tl("Berkas"), keys: isMac ? undefined : "Ctrl+Q", run: () => void api.windowAction("quit") },
  { id: "fullscreen", label: tl("Layar penuh"), group: tl("Tampilan"), keys: isMac ? "Ctrl+Mod+F" : "F11", run: () => void api.windowAction("fullscreen") },
  { id: "welcome", label: tl("Selamat datang"), group: tl("Bantuan"), run: () => A.showWelcome() },
  { id: "about", label: tl("Tentang Alexel Studio"), group: tl("Bantuan"), run: () => void A.showAbout() },
  { id: "checkUpdate", label: tl("Periksa pembaruan"), group: tl("Bantuan"), run: () => void A.checkForUpdates(true) },
  { id: "reportIssue", label: tl("Laporkan masalah"), group: tl("Bantuan"), run: () => void A.reportIssue() },
  { id: "keyboardShortcuts", label: tl("Shortcut keyboard"), group: tl("Bantuan"), run: () => A.openSettings(undefined, "keys") },
  { id: "newFile", label: tl("Berkas baru"), group: tl("Berkas"), keys: "Mod+N", run: () => A.newFile() },
  { id: "newFolder", label: tl("Folder baru"), group: tl("Berkas"), run: () => A.newFolder() },
  { id: "save", label: tl("Simpan"), group: tl("Berkas"), keys: "Mod+S", run: A.saveActive, when: hasText },
  { id: "saveAll", label: tl("Simpan semua"), group: tl("Berkas"), keys: "Mod+Alt+S", run: A.saveAll },
  { id: "closeTab", label: tl("Tutup tab"), group: tl("Berkas"), keys: "Mod+W", run: () => void A.closeTab(getState().groups[getState().focusedGroup]?.active ?? ""), when: hasTab },
  { id: "closeAll", label: tl("Tutup semua tab"), group: tl("Berkas"), run: () => void A.closeUnpinnedTabs() },
  { id: "pinTab", label: tl("Sematkan / lepas tab"), group: tl("Berkas"), run: () => { const id = activeTab()?.id; if (id) A.togglePinTab(id); }, when: () => !!activeTab() },
  { id: "revealFile", label: tl("Tampilkan berkas aktif di Explorer"), group: tl("Berkas"), run: () => A.revealInTree(activeTab()!.id), when: hasText },
  { id: "nextTab", label: tl("Tab berikutnya"), group: "Editor", keys: "Ctrl+Tab", run: () => A.cycleTab(1) },
  { id: "prevTab", label: tl("Tab sebelumnya"), group: "Editor", keys: "Ctrl+Shift+Tab", run: () => A.cycleTab(-1) },
  { id: "nextTab2", label: tl("Tab berikutnya"), group: "Editor", keys: "Mod+Shift+]", run: () => A.cycleTab(1), hidden: true },
  { id: "prevTab2", label: tl("Tab sebelumnya"), group: "Editor", keys: "Mod+Shift+[", run: () => A.cycleTab(-1), hidden: true },
  { id: "split", label: tl("Belah / gabung editor"), group: "Editor", keys: "Mod+\\", run: A.splitEditor },
  { id: "focusLeft", label: tl("Fokus editor kiri"), group: "Editor", keys: "Mod+1", run: () => { A.focusGroup(0); docs.focusEditor(0); } },
  { id: "focusRight", label: tl("Fokus editor kanan"), group: "Editor", keys: "Mod+2", run: () => { A.focusGroup(1); docs.focusEditor(1); } },
  { id: "fontUp", label: tl("Perbesar huruf editor"), group: "Editor", keys: "Mod+=", run: () => A.updateSettings({ fontSize: Math.min(28, getState().settings.fontSize + 1) }) },
  { id: "fontDown", label: tl("Perkecil huruf editor"), group: "Editor", keys: "Mod+-", run: () => A.updateSettings({ fontSize: Math.max(9, getState().settings.fontSize - 1) }) },
  { id: "wrap", label: tl("Bungkus baris panjang (word wrap)"), group: "Editor", keys: "Alt+Z", run: () => A.updateSettings({ wordWrap: !getState().settings.wordWrap }) },
  { id: "minimap", label: tl("Tampilkan/sembunyikan minimap"), group: "Editor", run: () => A.updateSettings({ minimap: !getState().settings.minimap }) },
  { id: "snapshot", label: tl("Snapshot kode jadi gambar"), group: "Editor", keys: "Mod+Shift+2", run: () => setState({ snapshotOpen: true }), when: hasText },

  { id: "sidebar", label: tl("Tampilkan/sembunyikan sidebar"), group: tl("Tampilan"), keys: "Mod+B", run: () => A.toggleSidebar() },
  { id: "explorer", label: "Explorer", group: tl("Tampilan"), keys: "Mod+Shift+E", run: () => A.toggleSidebar("files") },
  { id: "search", label: tl("Cari di seluruh project"), group: tl("Tampilan"), keys: "Mod+Shift+F", run: () => { setLayout({ sidebar: true, sideView: "search" }); requestAnimationFrame(() => document.getElementById("search-input")?.focus()); } },
  { id: "git", label: tl("Source control (Git)"), group: tl("Tampilan"), keys: "Ctrl+Shift+G", run: () => (designById(getState().settings.design).shell === "control" ? A.toggleRight("git") : A.toggleSidebar("git")) },
  { id: "todo", label: tl("Papan TODO"), group: tl("Tampilan"), run: () => A.togglePanel("todo") },
  { id: "extensions", label: tl("Ekstensi (tema, snippet, bahasa dari Open VSX)"), group: tl("Tampilan"), keys: "Mod+Shift+X", run: () => A.toggleSidebar("ext") },
  { id: "extThemeOff", label: tl("Lepas tema ekstensi"), group: tl("Desain"), run: () => A.updateSettings({ extTheme: null }), when: () => !!getState().settings.extTheme },
  { id: "iconThemeOff", label: tl("Lepas tema ikon berkas"), group: tl("Desain"), run: () => A.updateSettings({ iconTheme: null }), when: () => !!getState().settings.iconTheme },
  { id: "panel", label: tl("Tampilkan/sembunyikan panel bawah"), group: tl("Tampilan"), keys: "Mod+J", run: () => A.togglePanel() },
  { id: "terminal", label: "Terminal", group: "Terminal", keys: "Ctrl+`", run: toggleTerminal },
  { id: "splitTerminal", label: tl("Belah / gabung terminal"), group: "Terminal", keys: "Mod+Shift+5", run: () => void import("../terminal/terminals").then((T) => T.toggleSplitTerminal()) },
  { id: "newTerminal", label: tl("Terminal baru"), group: "Terminal", keys: "Ctrl+Shift+`", run: openShell },
  { id: "problems", label: tl("Masalah (error & peringatan)"), group: tl("Tampilan"), keys: "Mod+Shift+M", run: () => A.togglePanel("problems") },
  { id: "output", label: "Output", group: tl("Tampilan"), keys: "Mod+Shift+U", run: () => A.togglePanel("output") },
  { id: "outline", label: tl("Outline (struktur berkas)"), group: tl("Tampilan"), run: () => A.toggleSidebar("outline") },
  { id: "runView", label: "Run & Debug", group: tl("Tampilan"), keys: "Mod+Shift+D", run: () => A.toggleSidebar("run") },
  { id: "ports", label: tl("Port & proses yang berjalan"), group: tl("Tampilan"), run: () => A.togglePanel("ports") },
  { id: "history", label: tl("Time-travel berkas ini"), group: "Editor", keys: "Mod+Shift+H", run: () => { setState({ historyFor: activeTab()?.id ?? null }); A.togglePanel("history"); }, when: hasText },
  { id: "dashboard", label: tl("Dashboard project"), group: tl("Tampilan"), run: () => { const g = getState().groups[getState().focusedGroup]; if (g) setState({ groups: getState().groups.map((x, i) => (i === getState().focusedGroup ? { ...x, active: null } : x)) }); } },

  { id: "run", label: tl("Jalankan berkas aktif"), group: "Run", keys: "Mod+R", run: runActiveFile },
  { id: "debugStart", label: tl("Mulai debug / lanjutkan"), group: tl("Debug"), keys: "F5", run: () => void dbgm().then((m) => m.startDebug()) },
  { id: "runNoDebug", label: tl("Jalankan tanpa debug"), group: "Run", keys: "Ctrl+F5", run: runActiveFile, hidden: true },
  { id: "debugStop", label: tl("Hentikan debug"), group: tl("Debug"), keys: "Shift+F5", run: () => void dbgm().then((m) => m.stopDebug()), when: debugging },
  { id: "debugRestart", label: tl("Mulai ulang debug"), group: tl("Debug"), keys: "Mod+Shift+F5", run: () => void dbgm().then((m) => m.restartDebug()), when: debugging },
  { id: "debugPause", label: tl("Jeda"), group: tl("Debug"), keys: "F6", run: () => void dbgm().then((m) => m.pauseRun()), when: debugging },
  { id: "debugStepOver", label: "Step over", group: tl("Debug"), keys: "F10", run: () => void dbgm().then((m) => m.stepOver()), when: debugging },
  { id: "debugStepInto", label: "Step into", group: tl("Debug"), keys: "F11", run: () => void dbgm().then((m) => m.stepInto()), when: debugging },
  { id: "debugStepOut", label: "Step out", group: tl("Debug"), keys: "Shift+F11", run: () => void dbgm().then((m) => m.stepOut()), when: debugging },
  { id: "debugToggleBreakpoint", label: tl("Pasang/lepas breakpoint"), group: tl("Debug"), keys: "F9", run: () => void dbgm().then((m) => m.toggleBreakpointAtCursor()), when: hasText },
  { id: "launchJson", label: tl("Buka konfigurasi debug (launch.json)"), group: tl("Debug"), run: () => void A.openLaunchJson(), when: hasRoot },
  { id: "runTarget", label: tl("Smart Run: pilih target…"), group: "Run", run: () => openPalette("!"), when: hasRoot },
  { id: "stopRun", label: tl("Hentikan semua yang berjalan"), group: "Run", run: () => void import("../terminal/terminals").then(async (T) => { for (const t of getState().terminals) if (t.kind === "run" && t.status === "running") await T.stopTerminal(t.key); }), when: () => getState().terminals.some((t) => t.kind === "run" && t.status === "running") },

  { id: "atMention", label: tl("Kirim berkas/seleksi ke Claude Code di terminal (@)"), group: tl("Agen AI"), keys: "Mod+Alt+K", run: () => void import("../ide/ide").then((m) => m.sendAtMention()), when: hasText },
  { id: "claude", label: tl("Panel Agen AI"), group: tl("Agen AI"), keys: "Mod+Alt+B", run: () => A.toggleRight("claude") },
  { id: "askClaude", label: tl("Agen AI: buka & fokus"), group: tl("Agen AI"), keys: isMac ? "Mod+Escape" : "Ctrl+Alt+I", run: focusClaude }, // Ctrl+Esc membuka menu Start di Windows
  { id: "askClaude2", label: tl("Tanya agen AI"), group: tl("Agen AI"), keys: "Mod+L", run: focusClaude, hidden: true },
  { id: "claudeHistory", label: tl("Agen AI: riwayat percakapan"), group: tl("Agen AI"), run: () => { focusClaude(); setState({ chatHistoryOpen: true }); } },
  { id: "claudeMode", label: tl("Agen AI: ganti mode izin"), group: tl("Agen AI"), run: () => void claude().then((m) => m.cycleClaudeMode()) },
  { id: "fixWithAi", label: tl("Agen AI: perbaiki masalah di baris ini"), group: tl("Agen AI"), keys: "Mod+.", run: () => void import("../editor/fixWithAi").then((m) => m.fixAtCursor()), when: hasText },
  { id: "explainSel", label: tl("Agen AI: jelaskan seleksi"), group: tl("Agen AI"), run: () => void claude().then((m) => m.explainSelection()), when: hasText },
  { id: "claudeTerm", label: tl("Agen AI di terminal"), group: tl("Agen AI"), run: openClaudeInteractive },
  { id: "newChat", label: tl("Agen AI: percakapan baru"), group: tl("Agen AI"), run: () => void claude().then((m) => m.newConversation()) },

  { id: "settings", label: tl("Pengaturan"), group: tl("Umum"), keys: "Mod+,", run: () => A.openSettings() },
  { id: "cycleDesign", label: tl("Ganti ke desain berikutnya"), group: tl("Desain"), keys: isMac ? "Ctrl+Mod+T" : undefined, run: A.cycleDesign }, // Ctrl+Alt+T membuka terminal di GNOME
  ...DESIGNS.map((d) => ({ id: `design:${d.id}`, label: `Desain: ${d.name}`, group: tl("Desain"), run: () => A.setDesign(d.id) })),
  { id: "resetLayout", label: tl("Kembalikan tata letak desain ini"), group: tl("Desain"), run: A.resetLayout },
  { id: "power", label: tl("Mode hemat daya: ganti (otomatis / nyala / mati)"), group: tl("Umum"), run: () => { const m = getState().settings.powerMode; A.updateSettings({ powerMode: m === "auto" ? "on" : m === "on" ? "off" : "auto" }); } },
  { id: "gitFetch", label: tl("Git: fetch semua remote"), group: "Git", run: () => void import("./gitOps").then((G) => G.fetchAll()), when: () => !!getState().git?.is_repo },
  { id: "gitStash", label: tl("Git: stash perubahan…"), group: "Git", run: () => void import("./gitOps").then((G) => G.stashChanges()), when: () => !!getState().git?.files.length },
  { id: "gitStashPop", label: tl("Git: terapkan stash terakhir (pop)"), group: "Git", run: () => void import("./gitOps").then((G) => G.popLatestStash()), when: () => !!getState().git?.is_repo },
  { id: "gitMerge", label: tl("Git: merge branch…"), group: "Git", run: () => void import("./gitOps").then((G) => G.mergeBranch()), when: () => !!getState().git?.is_repo },
  { id: "gitRebase", label: tl("Git: rebase ke…"), group: "Git", run: () => void import("./gitOps").then((G) => G.rebaseBranch()), when: () => !!getState().git?.is_repo },
  { id: "gitAbort", label: tl("Git: batalkan merge/rebase/cherry-pick"), group: "Git", run: () => void import("./gitOps").then((G) => G.abortOp()), when: () => !!getState().git?.is_repo },
  { id: "gitContinue", label: tl("Git: lanjutkan merge/rebase/cherry-pick"), group: "Git", run: () => void import("./gitOps").then((G) => G.continueOp()), when: () => !!getState().git?.is_repo },
  { id: "gitBranchNew", label: tl("Git: branch baru…"), group: "Git", run: () => void import("./gitOps").then((G) => G.createBranch()), when: () => !!getState().git?.is_repo },
  { id: "gitBranchDelete", label: tl("Git: hapus branch…"), group: "Git", run: () => void import("./gitOps").then((G) => G.deleteBranch()), when: () => !!getState().git?.is_repo },
  { id: "gitTag", label: tl("Git: buat tag…"), group: "Git", run: () => void import("./gitOps").then((G) => G.createTag()), when: () => !!getState().git?.is_repo },
  { id: "gitBlame", label: tl("Git: blame baris aktif (nyala/mati)"), group: "Git", run: () => A.updateSettings({ gitBlame: !getState().settings.gitBlame }) },
  { id: "refresh", label: tl("Muat ulang tree & status git"), group: tl("Umum"), run: () => { void A.refreshTree(); void A.refreshGit(); } },
];

// ---------------- Keybinding ----------------

/**
 * Kombinasi tombol dalam notasi yang sama dengan `keys` di COMMANDS.
 * "Mod" = ⌘ di macOS, Ctrl di Windows/Linux (lihat normalizeKeys).
 */
function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac) {
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.metaKey) parts.push("Mod");
  } else if (e.ctrlKey) parts.push("Ctrl");
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
  // Huruf: pakai karakter yang diketik (Dvorak/AZERTY benar); dengan Alt/Option karakternya
  // berubah (⌥P → π), jadi saat itu pakai posisi tombol.
  else if (k.length === 1 && /[a-z]/i.test(k) && !e.altKey) k = k.toUpperCase();
  else if (e.code.startsWith("Key")) k = e.code.slice(3);
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}

const byKeys = new Map<string, Command[]>();
const DEFAULT_KEYS = new Map(COMMANDS.map((c) => [c.id, c.keys] as const));

/** Shortcut bawaan sebuah perintah (sebelum diubah pengguna). */
export const defaultKeysOf = (id: string) => DEFAULT_KEYS.get(id);

/**
 * Terapkan shortcut buatan pengguna (Pengaturan → Shortcut keyboard).
 * Nilai "" = shortcut dilepas; perintah yang tidak disebut memakai bawaan.
 */
export function applyKeybindings(over: Record<string, string> = {}) {
  byKeys.clear();
  for (const c of COMMANDS) {
    c.keys = c.id in over ? over[c.id] || undefined : DEFAULT_KEYS.get(c.id);
    if (c.keys) {
      const k = normalizeKeys(c.keys);
      byKeys.set(k, [...(byKeys.get(k) ?? []), c]);
    }
  }
}
applyKeybindings();

/** Perintah lain yang sudah memakai kombinasi ini (untuk peringatan bentrok). */
export const commandWithKeys = (keys: string) => byKeys.get(normalizeKeys(keys))?.[0];

/** Kombinasi tombol dari sebuah event keyboard, dalam notasi COMMANDS ("Mod+Shift+P"). */
export function recordCombo(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return null;
  const c = comboOf(e);
  // Kembalikan ke notasi lintas OS: di Windows/Linux Ctrl = Mod.
  return isMac ? c : c.replace(/^Ctrl\+/, "Mod+");
}

/**
 * Perintah yang tetap boleh dipakai saat fokus di terminal; sisanya diteruskan ke shell.
 * Di Windows/Linux Mod = Ctrl, jadi Ctrl+R (cari riwayat), Ctrl+L (bersihkan), Ctrl+B dan Ctrl+J milik readline/shell
 * dan tidak boleh dicuri; di macOS Mod = ⌘ sehingga aman.
 */
const TERMINAL_SAFE = new Set(["palette", "splitTerminal", ...(isMac ? ["run", "runNoDebug", "askClaude2", "sidebar", "panel"] : []), "stopRun", "runTarget", "debugRestart", "debugStart", "debugStop", "debugStepOver", "debugStepInto", "debugStepOut", "debugPause", "askClaude", "quickOpen", "palette2", "terminal", "newTerminal", "settings", "cycleDesign", "explorer", "search", "git", "extensions"]);

/** Global key handler (fase capture, supaya didahulukan dari CodeMirror). */
export function handleGlobalKey(e: KeyboardEvent) {
  if (e.isComposing) return;
  // Windows/Linux: AltGr dilaporkan sebagai Ctrl+Alt; itu karakter ([ { ś …), bukan shortcut.
  if (!isMac && e.getModifierState?.("AltGraph")) return;
  // Sedang merekam shortcut baru di Pengaturan.
  if (document.querySelector(".kbd.is-recording")) return;
  if (!(e.metaKey || e.ctrlKey || e.altKey || /^F\d{1,2}$/.test(e.key))) return;
  const s = getState();
  if (s.dialog || s.compare || s.snapshotOpen) return; // dialog menangani tombolnya sendiri
  const combo = comboOf(e);
  const el = e.target as HTMLElement | null;
  const inTerminal = !!el?.closest?.(".xterm");
  // ⌘K di terminal = bersihkan layar (seperti Terminal.app & VS Code).
  if (inTerminal && combo === normalizeKeys("Mod+K")) {
    e.preventDefault();
    e.stopPropagation();
    void import("../terminal/terminals").then((m) => m.clearTerminal(getState().activeTerminal ?? ""));
    return;
  }
  // ⌘K di editor = Claude inline (ubah seleksi). Di luar editor tetap palette perintah.
  if (combo === normalizeKeys("Mod+K") && el?.closest?.(".cm-editor")) {
    e.preventDefault();
    e.stopPropagation();
    void openInlineClaude();
    return;
  }
  // Satu kombinasi bisa dipakai beberapa perintah (mis. F11: step into saat debug, layar penuh di luar itu).
  const list = byKeys.get(combo);
  const cmd = list?.find((c) => c.when && c.when()) ?? list?.find((c) => !c.when);
  if (!cmd) return;
  if (inTerminal && !TERMINAL_SAFE.has(cmd.id)) return;
  // Di kolom input, biarkan ⌘A/⌘C dsb. Hanya perintah global yang ditangkap.
  const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !inTerminal;
  if (inField && ["save", "closeTab", "gotoLine", "wrap", "focusLeft", "focusRight", "fontUp", "fontDown", "snapshot"].includes(cmd.id)) return;
  if (s.palette.open && cmd.id !== "palette" && cmd.id !== "quickOpen") return;
  e.preventDefault();
  e.stopPropagation();
  void cmd.run();
}

/** Buka Claude inline di editor yang sedang fokus. */
export async function openInlineClaude() {
  const v = docs.viewOf(getState().focusedGroup);
  if (!v) return;
  const { openInline } = await import("../editor/inlineClaude");
  openInline(v);
}

/** Ganti seluruh perintah dari ekstensi (id berawalan "ext:") dan pasang ulang shortcut-nya. */
export function setExtensionCommands(list: Command[]) {
  for (let i = COMMANDS.length - 1; i >= 0; i--) if (COMMANDS[i].id.startsWith("ext:")) COMMANDS.splice(i, 1);
  COMMANDS.push(...list);
  for (const c of list) DEFAULT_KEYS.set(c.id, c.keys);
  applyKeybindings(getState().settings.keybindings);
}

export const visibleCommands = () => COMMANDS.filter((c) => !c.hidden && (!c.when || c.when()));
