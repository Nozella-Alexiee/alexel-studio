// Aksi tingkat aplikasi: project, tree, tab, simpan, berkas, git, desain.
// Semua aksi membaca state terbaru lewat getState() — tidak ada closure basi.

import { applyDesign, type DesignId } from "../design/designs";
import * as docs from "../editor/documents";
import { languageFor } from "../editor/languages";
import { api, errMsg, isDemo, pickFolder, setTrafficLights, setWindowTitle } from "../lib/ipc";
import { basename, dirname, isImagePath, isInside, join, relative, validateName } from "../lib/paths";
import {
  DEFAULT_LAYOUTS,
  DEFAULT_SETTINGS,
  ask,
  confirmDialog,
  getState,
  isSaver,
  promptDialog,
  setLayout,
  setState,
  toast,
  type Group,
  type Layout,
  type Settings,
  type Tab,
} from "../state/store";
import { persistSession, persistSettings } from "./persist";

export const SETTINGS_TAB = "nozel:settings";

// ---------------- Project & tree ----------------

export async function openProjectDialog() {
  const p = await pickFolder();
  if (p) await openProject(p);
}

export async function openProject(root: string, opts: { restoreTabs?: { groups: Group[]; focused: number } } = {}) {
  const prev = getState().root;
  if (prev && prev !== root) {
    const ok = await closeAllTabs();
    if (!ok) return;
  }
  setState({
    root,
    dirs: {},
    expanded: { [root]: true },
    git: null,
    gitMarks: {},
    gitDirs: {},
    runTargets: [],
    todos: null,
    problems: {},
    chat: [],
    chatSession: null,
  });
  const recents = [root, ...getState().recents.filter((r) => r !== root)].slice(0, 12);
  setState({ recents });
  void api.storeSave("recents", JSON.stringify(recents)).catch(() => {});
  await loadDir(root);
  void api.previewRoot(root).catch(() => {});
  void api.watch(root, isSaver() ? 1500 : 300).catch((e) => console.warn(e));
  void refreshGit();
  void refreshRunTargets();
  void import("../panels/todoData").then((m) => m.refreshTodos());
  void setWindowTitle(`${basename(root)} — Nozel Code`);
  if (opts.restoreTabs) {
    for (let g = 0; g < opts.restoreTabs.groups.length && g < 2; g++) {
      const grp = opts.restoreTabs.groups[g];
      for (const id of grp.tabs) {
        if (id === SETTINGS_TAB) openSettings(g);
        else await openFile(id, { group: g, quiet: true });
      }
      if (grp.active && getState().tabs[grp.active]) activateTab(grp.active, g);
    }
    setState({ focusedGroup: Math.min(opts.restoreTabs.focused, getState().groups.length - 1) });
  }
  persistSession();
}

export async function closeProject() {
  if (!(await closeAllTabs())) return;
  void api.unwatch().catch(() => {});
  void api.previewRoot(null).catch(() => {});
  setState({ root: null, dirs: {}, expanded: {}, git: null, gitMarks: {}, gitDirs: {}, runTargets: [], todos: null, chat: [], chatSession: null });
  persistSession();
}

export async function loadDir(dir: string) {
  try {
    const entries = await api.listDir(dir);
    setState((s) => ({ dirs: { ...s.dirs, [dir]: entries } }));
  } catch (e) {
    setState((s) => {
      const d = { ...s.dirs };
      delete d[dir];
      const ex = { ...s.expanded };
      delete ex[dir];
      return { dirs: d, expanded: ex };
    });
    if (dir === getState().root) toast(`Gagal membuka folder: ${errMsg(e)}`, "error");
  }
}

export async function toggleDir(dir: string, open?: boolean) {
  const isOpen = !!getState().expanded[dir];
  const next = open ?? !isOpen;
  setState((s) => {
    const ex = { ...s.expanded };
    if (next) ex[dir] = true;
    else delete ex[dir];
    return { expanded: ex };
  });
  if (next) await loadDir(dir);
}

/** Muat ulang semua folder yang sedang terbuka (struktur tree tetap). */
export async function refreshTree() {
  const s = getState();
  if (!s.root) return;
  const open = Object.keys(s.expanded).filter((d) => isInside(s.root!, d));
  await Promise.all(open.map(loadDir));
}

export async function revealInTree(path: string) {
  const root = getState().root;
  if (!root || !isInside(root, path)) return;
  let d = dirname(path);
  const chain: string[] = [];
  while (d.length >= root.length) {
    chain.unshift(d);
    if (d === root) break;
    d = dirname(d);
  }
  for (const c of chain) await toggleDir(c, true);
  setLayout({ sidebar: true, sideView: "files" });
  requestAnimationFrame(() => document.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "nearest" }));
}

// ---------------- Tabs ----------------

function ensureGroup(g: number): number {
  const groups = getState().groups;
  if (g < groups.length) return g;
  setState({ groups: [...groups, { tabs: [], active: null }] });
  return getState().groups.length - 1;
}

function addTabToGroup(id: string, g: number) {
  setState((s) => {
    const groups = s.groups.map((grp, i) => (i === g ? { tabs: grp.tabs.includes(id) ? grp.tabs : [...grp.tabs, id], active: id } : grp));
    return { groups, focusedGroup: g };
  });
}

const opening = new Map<string, Promise<boolean>>();

export async function openFile(path: string, opts: { group?: number; line?: number; col?: number; len?: number; quiet?: boolean; preview?: Tab["preview"] } = {}): Promise<boolean> {
  const g = ensureGroup(opts.group ?? getState().focusedGroup);
  const existing = getState().tabs[path];
  if (!existing) {
    // Klik ganda cepat tidak membuka dua tab.
    let p = opening.get(path);
    if (!p) {
      p = createTab(path, opts);
      opening.set(path, p);
      p.finally(() => opening.delete(path));
    }
    if (!(await p)) return false;
  }
  addTabToGroup(path, g);
  if (opts.line) requestAnimationFrame(() => requestAnimationFrame(() => docs.revealPosition(g, opts.line!, opts.col, opts.len)));
  persistSession();
  return true;
}

async function createTab(path: string, opts: { quiet?: boolean; preview?: Tab["preview"] }): Promise<boolean> {
  const name = basename(path);
  if (isImagePath(path)) {
    setState((s) => ({ tabs: { ...s.tabs, [path]: { id: path, name, kind: "image", dirty: false, lang: "Gambar", preview: "code" } } }));
    return true;
  }
  try {
    const doc = await docs.openDocument(path);
    const lang = doc.langName;
    const isMd = doc.langId === "md";
    const isHtml = doc.langId === "html" && /\.html?$/i.test(path);
    const preview: Tab["preview"] = opts.preview ?? (isMd || isHtml ? "split" : "code");
    setState((s) => ({ tabs: { ...s.tabs, [path]: { id: path, name, kind: "text", dirty: false, lang, preview } } }));
    return true;
  } catch (e) {
    const msg = errMsg(e);
    if (!opts.quiet) {
      if (msg.startsWith("BINARY")) toast(`${name} adalah berkas biner, tidak dibuka di editor.`, "info");
      else toast(msg.replace(/^(ENCODING|BINARY): /, ""), "error");
    }
    return false;
  }
}

export function openSettings(group = getState().focusedGroup) {
  if (!getState().tabs[SETTINGS_TAB]) {
    setState((s) => ({ tabs: { ...s.tabs, [SETTINGS_TAB]: { id: SETTINGS_TAB, name: "Pengaturan", kind: "settings", dirty: false, lang: "", preview: "code" } } }));
  }
  addTabToGroup(SETTINGS_TAB, ensureGroup(group));
}

export function activateTab(id: string, g = getState().focusedGroup) {
  setState((s) => ({ groups: s.groups.map((grp, i) => (i === g ? { ...grp, active: id } : grp)), focusedGroup: g }));
  persistSession();
}

export function focusGroup(g: number) {
  if (g < getState().groups.length) setState({ focusedGroup: g });
}

function removeFromGroup(id: string, g: number) {
  setState((s) => {
    let groups = s.groups.map((grp, i) => {
      if (i !== g) return grp;
      const idx = grp.tabs.indexOf(id);
      const tabs = grp.tabs.filter((t) => t !== id);
      const active = grp.active === id ? tabs[Math.min(idx, tabs.length - 1)] ?? null : grp.active;
      return { tabs, active };
    });
    // Grup kanan kosong → tutup split.
    if (groups.length > 1 && groups[1].tabs.length === 0) groups = [groups[0]];
    if (groups.length > 1 && groups[0].tabs.length === 0) groups = [groups[1]];
    const stillOpen = groups.some((grp) => grp.tabs.includes(id));
    const tabs = { ...s.tabs };
    if (!stillOpen) delete tabs[id];
    return { groups, tabs, focusedGroup: Math.min(s.focusedGroup, groups.length - 1) };
  });
  docs.forgetGroupState(g, id);
  if (!getState().groups.some((grp) => grp.tabs.includes(id))) docs.closeDocument(id);
}

/** Tutup tab. Kalau ada editan belum disimpan, tanya dulu. Mengembalikan false kalau dibatalkan. */
export async function closeTab(id: string, g = getState().focusedGroup): Promise<boolean> {
  const s = getState();
  const tab = s.tabs[id];
  if (!tab) return true;
  const openElsewhere = s.groups.some((grp, i) => i !== g && grp.tabs.includes(id));
  if (tab.dirty && !openElsewhere) {
    const choice = await ask({
      kind: "choice",
      title: `Simpan perubahan di ${tab.name}?`,
      message: "Kalau tidak disimpan, perubahanmu akan hilang.",
      choices: [
        { id: "save", label: "Simpan" },
        { id: "discard", label: "Jangan simpan", danger: true },
      ],
    });
    if (choice === "save") {
      if (!(await docs.saveDocument(id))) return false;
    } else if (choice !== "discard") return false;
  }
  removeFromGroup(id, g);
  persistSession();
  return true;
}

export async function closeOtherTabs(keep: string, g = getState().focusedGroup) {
  for (const id of [...(getState().groups[g]?.tabs ?? [])]) if (id !== keep && !(await closeTab(id, g))) return;
}

/** Tutup semua tab; tanya sekali untuk semua editan yang belum disimpan. */
export async function closeAllTabs(): Promise<boolean> {
  const dirty = Object.values(getState().tabs).filter((t) => t.dirty);
  if (dirty.length) {
    const choice = await ask({
      kind: "choice",
      title: dirty.length === 1 ? `Simpan perubahan di ${dirty[0].name}?` : `Simpan perubahan di ${dirty.length} berkas?`,
      message: dirty.map((t) => t.name).join(", "),
      choices: [
        { id: "save", label: "Simpan semua" },
        { id: "discard", label: "Jangan simpan", danger: true },
      ],
    });
    if (choice === "save") {
      for (const t of dirty) if (!(await docs.saveDocument(t.id))) return false;
    } else if (choice !== "discard") return false;
  }
  for (const id of Object.keys(getState().tabs)) docs.closeDocument(id);
  setState({ tabs: {}, groups: [{ tabs: [], active: null }], focusedGroup: 0 });
  return true;
}

export function cycleTab(dir: 1 | -1) {
  const s = getState();
  const grp = s.groups[s.focusedGroup];
  if (!grp?.tabs.length) return;
  const i = grp.active ? grp.tabs.indexOf(grp.active) : 0;
  activateTab(grp.tabs[(i + dir + grp.tabs.length) % grp.tabs.length]);
}

export function splitEditor() {
  const s = getState();
  const active = s.groups[s.focusedGroup]?.active;
  if (s.groups.length > 1) {
    // Sudah split → gabung lagi ke satu grup.
    const merged = [...new Set([...s.groups[0].tabs, ...s.groups[1].tabs])];
    s.groups[1].tabs.forEach((id) => docs.forgetGroupState(1, id));
    setState({ groups: [{ tabs: merged, active: s.groups[0].active ?? active ?? null }], focusedGroup: 0 });
    return;
  }
  if (!active) return toast("Buka berkas dulu untuk membelah editor.");
  setState({ groups: [s.groups[0], { tabs: [active], active }], focusedGroup: 1 });
  persistSession();
}

export function setTabPreview(id: string, preview: Tab["preview"]) {
  setState((s) => (s.tabs[id] ? { tabs: { ...s.tabs, [id]: { ...s.tabs[id], preview } } } : {}));
}

// ---------------- Simpan ----------------

export async function saveActive() {
  const s = getState();
  const id = s.groups[s.focusedGroup]?.active;
  if (!id || s.tabs[id]?.kind !== "text") return;
  await docs.saveDocument(id);
}

export async function saveAll() {
  for (const t of Object.values(getState().tabs)) if (t.dirty) await docs.saveDocument(t.id, { quiet: true });
}

let gitTimer = 0;
export function afterSave(path: string, quiet?: boolean) {
  if (!quiet) toast(`${basename(path)} tersimpan`, "success");
  const s = getState();
  clearTimeout(gitTimer);
  gitTimer = window.setTimeout(() => void refreshGit(), 400);
  if (s.settings.gitBot !== "off" && s.root && s.git?.is_repo && isInside(s.root, path)) {
    void api
      .gitAutoCommit(s.git.root || s.root, path, s.settings.gitBot === "push")
      .then((m) => toast(`Git Bot: ${m}`, "success"))
      .catch((e) => toast(errMsg(e), "error"))
      .finally(() => void refreshGit());
  }
}

// ---------------- Operasi berkas ----------------

function targetDir(path?: string | null): string | null {
  const s = getState();
  if (path) {
    const entries = Object.values(s.dirs).flat();
    const e = entries.find((x) => x.path === path);
    return e?.is_dir ? path : dirname(path);
  }
  return s.root;
}

export async function newFile(inPath?: string | null) {
  const dir = targetDir(inPath);
  if (!dir) return toast("Buka folder project dulu.");
  const name = await promptDialog("Berkas baru", { message: `Di ${relative(getState().root ?? "", dir) || "akar project"}`, placeholder: "nama-berkas.ts", validate: validateName, okLabel: "Buat" });
  if (!name) return;
  const path = join(dir, name.trim());
  try {
    await api.createFile(path);
    await toggleDir(dir, true);
    await openFile(path);
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function newFolder(inPath?: string | null) {
  const dir = targetDir(inPath);
  if (!dir) return toast("Buka folder project dulu.");
  const name = await promptDialog("Folder baru", { placeholder: "nama-folder", validate: validateName, okLabel: "Buat" });
  if (!name) return;
  try {
    await api.createDir(join(dir, name.trim()));
    await toggleDir(dir, true);
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

function retargetTabs(oldPath: string, newPath: string) {
  const affected = docs.docsUnder(oldPath);
  for (const p of affected) {
    const np = newPath + p.slice(oldPath.length);
    docs.renameDocument(p, np);
    setState((s) => {
      const tabs = { ...s.tabs };
      const t = tabs[p];
      if (t) {
        delete tabs[p];
        tabs[np] = { ...t, id: np, name: basename(np), lang: languageFor(basename(np)).name };
      }
      const groups = s.groups.map((g) => ({ tabs: g.tabs.map((x) => (x === p ? np : x)), active: g.active === p ? np : g.active }));
      return { tabs, groups };
    });
  }
}

export async function renamePath(path: string) {
  const old = basename(path);
  const name = await promptDialog("Ganti nama", { defaultValue: old, validate: validateName, okLabel: "Ganti" });
  if (!name || name === old) return;
  const np = join(dirname(path), name.trim());
  try {
    await api.rename(path, np);
    retargetTabs(path, np);
    await loadDir(dirname(path));
    persistSession();
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function movePath(path: string, toDir: string) {
  if (toDir === dirname(path) || isInside(path, toDir)) return;
  const np = join(toDir, basename(path));
  try {
    await api.rename(path, np);
    retargetTabs(path, np);
    await Promise.all([loadDir(dirname(path)), loadDir(toDir)]);
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function deletePath(path: string) {
  const name = basename(path);
  if (getState().settings.confirmDelete && !(await confirmDialog(`Pindahkan "${name}" ke Trash?`, "Kamu masih bisa mengembalikannya dari Trash macOS.", "Pindahkan ke Trash", true))) return;
  try {
    await api.trash(path);
    // Tutup tab berkas itu dan semua isi folder (tanpa tanya; isinya sudah di Trash).
    for (const p of docs.docsUnder(path)) {
      const st = getState();
      st.groups.forEach((g, i) => g.tabs.includes(p) && removeFromGroup(p, i));
    }
    await loadDir(dirname(path));
    toast(`${name} dipindah ke Trash`, "success");
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function duplicatePath(path: string) {
  try {
    const np = await api.duplicate(path);
    await loadDir(dirname(path));
    if (!isImagePath(np)) await openFile(np);
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function copyPath(path: string, rel = false) {
  const root = getState().root;
  await navigator.clipboard.writeText(rel && root ? relative(root, path) : path).catch(() => {});
  toast("Path disalin");
}

// ---------------- Git & data project ----------------

let gitBusy: Promise<void> | null = null;
export async function refreshGit() {
  const root = getState().root;
  if (!root) return;
  if (gitBusy) return gitBusy;
  gitBusy = (async () => {
    try {
      const st = await api.gitStatus(root);
      if (getState().root !== root) return;
      const marks: Record<string, string> = {};
      if (st.is_repo) for (const f of st.files) marks[join(st.root, f.path)] = f.untracked ? "U" : f.conflicted ? "!" : f.xy.includes("D") ? "D" : f.xy.trim()[0] === "A" ? "A" : "M";
      const gitDirs: Record<string, true> = {};
      for (const f of Object.keys(marks)) {
        let d = dirname(f);
        while (d.length > 1 && !gitDirs[d]) {
          gitDirs[d] = true;
          d = dirname(d);
        }
      }
      const hadRepo = getState().git?.is_repo;
      setState({ git: st, gitMarks: marks, gitDirs });
      if (!hadRepo && st.is_repo) docs.refreshHeads();
    } catch (e) {
      console.warn("git status", e);
    } finally {
      gitBusy = null;
    }
  })();
  return gitBusy;
}

export async function refreshRunTargets() {
  const root = getState().root;
  if (!root) return;
  try {
    const t = await api.runTargets(root);
    if (getState().root === root) setState({ runTargets: t });
  } catch {
    /* project tanpa konfigurasi run */
  }
}

/** Dipanggil dari event watcher `fs-changed`. */
export async function onFsChanged(paths: string[], git: boolean) {
  const s = getState();
  if (!s.root) return;
  const dirsToReload = new Set<string>();
  for (const p of paths) {
    const d = dirname(p);
    if (s.expanded[d]) dirsToReload.add(d);
    if (s.expanded[p]) dirsToReload.add(p);
  }
  await Promise.all([...dirsToReload].map(loadDir));
  for (const p of paths) {
    if (!getState().tabs[p] || getState().tabs[p].kind !== "text") continue;
    const r = await docs.externalChange(p);
    if (r === "conflict") toast(`${basename(p)} berubah di disk saat ada editan yang belum disimpan.`, "error", { label: "Bandingkan", run: () => void import("./conflicts").then((m) => m.resolveConflict(p)) });
    if (r === "missing") toast(`${basename(p)} dihapus dari luar Nozel.`, "info");
  }
  if (git || paths.length) {
    clearTimeout(gitTimer);
    gitTimer = window.setTimeout(() => void refreshGit(), 250);
  }
  if (git) docs.refreshHeads();
  if (paths.some((p) => /(^|\/)(package\.json|Cargo\.toml|Makefile|composer\.json|go\.mod|deno\.jsonc?)$/.test(p))) void refreshRunTargets();
  void import("../panels/todoData").then((m) => m.scheduleTodoRefresh());
}

// ---------------- Desain & pengaturan ----------------

export function setDesign(id: DesignId) {
  const s = getState();
  const accent = s.settings.design === id ? s.settings.accent : null;
  updateSettings({ design: id, accent });
}

export function cycleDesign() {
  const order: DesignId[] = ["aurora", "zen", "control", "antartika", "tuxedo", "kawanan"];
  const cur = order.indexOf(getState().settings.design);
  setDesign(order[(cur + 1) % order.length]);
}

export function updateSettings(patch: Partial<Settings>) {
  const prev = getState().settings;
  const next = { ...prev, ...patch };
  setState({ settings: next });
  if (patch.design !== undefined || patch.accent !== undefined) {
    // Diterapkan langsung. (View Transition API tertahan saat jendela tidak dirender,
    // sehingga desain tidak pernah berganti — jangan dipakai di sini.)
    applyDesign(next.design, next.accent);
    syncTrafficLights();
  }
  if (["fontSize", "tabSize", "wordWrap", "minimap", "design"].some((k) => k in patch)) requestAnimationFrame(() => docs.applyEditorSettings());
  persistSettings();
}

/** Posisikan tombol jendela macOS di tengah title bar desain aktif. */
export function syncTrafficLights() {
  requestAnimationFrame(() => {
    const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--titlebar-h")) || 44;
    void setTrafficLights((h - 14) / 2);
  });
}

export function resetLayout() {
  const d = getState().settings.design;
  setState((s) => ({ layouts: { ...s.layouts, [d]: DEFAULT_LAYOUTS[d] } }));
  persistSession();
}

export function togglePanel(tab?: Layout["panelTab"]) {
  const s = getState();
  const l = s.layouts[s.settings.design];
  if (tab && (!l.panel || l.panelTab !== tab)) setLayout({ panel: true, panelTab: tab });
  else setLayout({ panel: !l.panel });
  persistSession();
}

export function toggleSidebar(view?: Layout["sideView"]) {
  const s = getState();
  const l = s.layouts[s.settings.design];
  if (view && (!l.sidebar || l.sideView !== view)) setLayout({ sidebar: true, sideView: view });
  else setLayout({ sidebar: !l.sidebar });
  persistSession();
}

export function toggleRight(view?: Layout["rightView"]) {
  const s = getState();
  const l = s.layouts[s.settings.design];
  if (view && (!l.right || l.rightView !== view)) setLayout({ right: true, rightView: view });
  else setLayout({ right: !l.right });
  persistSession();
}

export function resetSettings() {
  setState({ settings: DEFAULT_SETTINGS });
  applyDesign(DEFAULT_SETTINGS.design, null);
  docs.applyEditorSettings();
  persistSettings();
}

export const demoMode = isDemo;
