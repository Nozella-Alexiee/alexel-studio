// Manajemen dokumen terbuka. Tiap berkas punya satu "Doc" dengan EditorState per
// grup editor (kiri/kanan). Pindah tab = view.setState(), jadi undo, kursor, fold,
// dan scroll tetap utuh. Edit di satu grup disinkronkan ke grup lain.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { forceLinting, lintGutter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, Prec, Text, type Extension, Transaction } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type ViewUpdate,
} from "@codemirror/view";
import { api, errMsg } from "../lib/ipc";
import { basename, isInside } from "../lib/paths";
import { getState, isSaver, setState, type Problem, type Settings } from "../state/store";
import { gitGutter, refreshGitGutter } from "./gitGutter";
import { languageFor } from "./languages";
import { inlineClaude } from "./inlineClaude";
import { detectIndent, minimalChange } from "../lib/text";
import { nozelLinter } from "./lint";
import { minimap } from "./minimap";
import { snippetExtension } from "./snippets";
import { nozelEditorTheme } from "./theme";
import { debugExtension } from "../debug/editor";

const syncAnno = Annotation.define<boolean>();

export interface Doc {
  path: string;
  saved: Text;
  mtime: number;
  eol: "lf" | "crlf";
  /** Nama berkas contoh untuk bahasa yang dipilih manual (mis. "x.py"); null = dari nama berkas. */
  langFile?: string | null;
  langId: string;
  langName: string;
  language: Extension | null;
  states: (EditorState | null)[];
  scroll: number[];
  head: string | null | undefined;
  /** Ekstensi language server (kalau ada server untuk bahasa ini). */
  lsp: Extension | null;
  /** Grup editor yang memegang koneksi LSP (satu view per berkas). */
  lspGroup: number;
  lspName?: string;
  /** Indentasi yang terdeteksi dari isi berkas ("\t" atau sejumlah spasi); null = ikut Pengaturan. */
  indent: string | null;
}

const docs = new Map<string, Doc>();
const views: (EditorView | null)[] = [null, null];
/** Path yang sedang ditampilkan tiap view. */
const shown: (string | null)[] = [null, null];
const langComp = new Compartment();
const settingsComp = new Compartment();
const lintComp = new Compartment();
const lspComp = new Compartment();

export const getDoc = (path: string) => docs.get(path);
export const openDocs = () => [...docs.values()];
export const viewOf = (group: number) => views[group];

function settingsExt(s: Settings, saver: boolean): Extension {
  const ext: Extension[] = [
    EditorState.tabSize.of(s.tabSize),
    indentUnit.of(" ".repeat(s.tabSize)),
    EditorView.theme({ "&": { fontSize: `${s.fontSize}px` } }),
    EditorView.darkTheme.of(document.documentElement.dataset.scheme !== "light"),
  ];
  if (s.wordWrap) ext.push(EditorView.lineWrapping);
  if (s.minimap && !saver) ext.push(minimap);
  return ext;
}

function currentSettingsExt() {
  const st = getState();
  return settingsExt(st.settings, isSaver(st));
}

function setProblems(path: string, list: Problem[]) {
  const prev = getState().problems[path];
  if (!prev?.length && !list.length) return;
  setState((s) => ({ problems: { ...s.problems, [path]: list } }));
}

function baseExtensions(doc: Doc, group: number): Extension {
  const saver = isSaver();
  return [
    inlineClaude(),
    debugExtension(doc.path),
    ...(doc.indent ? [Prec.highest(indentUnit.of(doc.indent))] : []),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter({ openText: "▾", closedText: "▸" }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ maxRenderedOptions: 40, icons: true }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
    nozelEditorTheme,
    snippetExtension(doc.langId),
    lintGutter(),
    lintComp.of(doc.lsp ? [] : lezerLinter(doc, saver)),
    lspComp.of(doc.lsp && group === doc.lspGroup ? doc.lsp : []),
    gitGutter(() => doc.head),
    langComp.of(doc.language ?? []),
    settingsComp.of(currentSettingsExt()),
    EditorView.updateListener.of((u) => onUpdate(doc, group, u)),
  ];
}

function lezerLinter(doc: Doc, saver: boolean): Extension {
  return nozelLinter(doc.langId, saver ? 1200 : 450, (d, state) => {
    setProblems(
      doc.path,
      d.map((x) => {
        const line = state.doc.lineAt(Math.min(x.from, state.doc.length));
        return { line: line.number, col: x.from - line.from + 1, message: x.message, severity: x.severity as Problem["severity"], source: x.source };
      })
    );
  });
}

/** Sambungkan dokumen ke language server bila tersedia (async, tidak menahan pembukaan berkas). */
async function attachLsp(doc: Doc) {
  try {
    const { lspFor } = await import("./lsp");
    const r = await lspFor(doc.path, doc.langId);
    if (!r || docs.get(doc.path) !== doc) return;
    doc.lsp = r.extension;
    doc.lspName = r.server.name;
    const shownIn = shown.findIndex((p) => p === doc.path);
    doc.lspGroup = shownIn >= 0 ? shownIn : doc.states.findIndex(Boolean) >= 0 ? doc.states.findIndex(Boolean) : 0;
    for (let g = 0; g < doc.states.length; g++) {
      const effects = [lintComp.reconfigure([]), lspComp.reconfigure(g === doc.lspGroup ? r.extension : [])];
      const v = views[g];
      if (v && shown[g] === doc.path) v.dispatch({ effects });
      else if (doc.states[g]) doc.states[g] = doc.states[g]!.update({ effects }).state;
    }
  } catch (e) {
    console.warn("LSP", doc.path, e);
  }
}

function createState(doc: Doc, group: number, text: Text | string): EditorState {
  return EditorState.create({ doc: text, extensions: baseExtensions(doc, group) });
}

/** State terbaru dokumen: yang sedang tampil di view didahulukan (state tersimpan bisa basi). */
function anyState(doc: Doc): EditorState | null {
  for (let g = 0; g < views.length; g++) {
    if (views[g] && shown[g] === doc.path) return views[g]!.state;
  }
  return doc.states.find(Boolean) ?? null;
}

export function currentText(path: string): string | null {
  const d = docs.get(path);
  if (!d) return null;
  const v = views.findIndex((v, i) => v && shown[i] === path);
  const st = v >= 0 ? views[v]!.state : anyState(d);
  return st ? st.doc.toString() : d.saved.toString();
}

function liveState(doc: Doc, group: number): EditorState | null {
  const v = views[group];
  if (v && shown[group] === doc.path) return v.state;
  return doc.states[group];
}

function onUpdate(doc: Doc, group: number, u: ViewUpdate) {
  if (u.selectionSet || u.docChanged) {
    if (getState().focusedGroup === group) {
      const head = u.state.selection.main;
      const line = u.state.doc.lineAt(head.head);
      setState({ cursor: { line: line.number, col: head.head - line.from + 1, sel: Math.abs(head.to - head.from) } });
    }
  }
  if (!u.docChanged) return;
  const isSync = u.transactions.some((t: Transaction) => t.annotation(syncAnno));
  if (!isSync) {
    // Sinkronkan ke grup lain yang membuka berkas yang sama.
    for (let g = 0; g < doc.states.length; g++) {
      if (g === group) continue;
      const other = liveState(doc, g);
      if (!other) continue;
      const v = views[g];
      // addToHistory=false: undo di grup ini tidak ikut membatalkan ketikan dari grup lain.
      const spec = { changes: u.changes, annotations: [syncAnno.of(true), Transaction.addToHistory.of(false)] };
      if (v && shown[g] === doc.path) v.dispatch(spec);
      else doc.states[g] = other.update(spec).state;
    }
  }
  markDirty(doc, u.state.doc);
  schedulePreview(doc.path);
  scheduleAutoSave(doc.path);
  if (u.transactions.some((t) => t.isUserEvent("input.type"))) trackTyping();
}

// Ngetik cepat beberapa detik → maskot ikut "semangat" (paling sering sekali per menit).
const typing: number[] = [];
let lastCheer = 0;
function trackTyping() {
  const now = Date.now();
  typing.push(now);
  while (typing.length && now - typing[0] > 4000) typing.shift();
  if (typing.length >= 28 && now - lastCheer > 60_000) {
    lastCheer = now;
    void import("../components/PenguinMascot").then((m) => m.flashPenguin("semangat", 2600));
  }
}

function markDirty(doc: Doc, text: Text) {
  const dirty = text.length !== doc.saved.length || !text.eq(doc.saved);
  const tab = getState().tabs[doc.path];
  if (tab && tab.dirty !== dirty) setState((s) => ({ tabs: { ...s.tabs, [doc.path]: { ...s.tabs[doc.path], dirty } } }));
}

// ---------- Pratinjau & autosave ----------

const previewTimers = new Map<string, number>();
const previewListeners = new Set<(path: string) => void>();
export function onDocTextChange(cb: (path: string) => void) {
  previewListeners.add(cb);
  return () => previewListeners.delete(cb);
}
function schedulePreview(path: string) {
  if (!previewListeners.size) return;
  clearTimeout(previewTimers.get(path));
  previewTimers.set(
    path,
    window.setTimeout(() => previewListeners.forEach((l) => l(path)), isSaver() ? 900 : 300)
  );
}

const autoSaveTimers = new Map<string, number>();
function scheduleAutoSave(path: string) {
  if (getState().settings.autoSave !== "delay") return;
  clearTimeout(autoSaveTimers.get(path));
  autoSaveTimers.set(path, window.setTimeout(() => void saveDocument(path, { quiet: true }), 1200));
}

// ---------- Bahasa ----------

async function loadLanguage(doc: Doc) {
  try {
    const ext = await languageFor(doc.langFile ?? doc.path).load();
    if (docs.get(doc.path) !== doc) return; // dokumen sudah ditutup
    doc.language = ext;
    for (let g = 0; g < doc.states.length; g++) {
      const v = views[g];
      const effects = langComp.reconfigure(ext);
      if (v && shown[g] === doc.path) {
        v.dispatch({ effects });
        forceLinting(v);
      } else if (doc.states[g]) doc.states[g] = doc.states[g]!.update({ effects }).state;
    }
  } catch (e) {
    console.warn("Gagal memuat bahasa", doc.path, e);
  }
}

/**
 * Deteksi ulang bahasa semua dokumen terbuka (mis. setelah ekstensi grammar dimuat atau dipasang,
 * karena tab yang dipulihkan saat start dibuka sebelum daftar ekstensi siap).
 */
/** Pilih bahasa secara manual dari status bar (ext contoh, mis. "py"); null = kembali otomatis. */
export function setDocLanguage(path: string, ext: string | null) {
  const doc = docs.get(path);
  if (!doc) return;
  doc.langFile = ext ? `berkas.${ext}` : null;
  const info = languageFor(doc.langFile ?? basename(doc.path));
  doc.langId = info.id;
  doc.langName = info.name;
  const tab = getState().tabs[path];
  if (tab) setState((s) => ({ tabs: { ...s.tabs, [path]: { ...tab, lang: info.name } } }));
  void loadLanguage(doc);
}

/** Ganti akhir baris (LF/CRLF); berlaku saat berkas disimpan. */
export function setDocEol(path: string, eol: "lf" | "crlf") {
  const doc = docs.get(path);
  if (!doc || doc.eol === eol) return;
  doc.eol = eol;
  const tab = getState().tabs[path];
  if (tab) setState((s) => ({ tabs: { ...s.tabs, [path]: { ...tab, dirty: true } } }));
}

export function redetectLanguages() {
  for (const doc of docs.values()) {
    if (doc.langFile) continue;
    const info = languageFor(basename(doc.path));
    if (info.id === doc.langId && info.name === doc.langName) continue;
    doc.langId = info.id;
    doc.langName = info.name;
    const tab = getState().tabs[doc.path];
    if (tab) setState((s) => ({ tabs: { ...s.tabs, [doc.path]: { ...tab, lang: info.name } } }));
    void loadLanguage(doc);
  }
}

async function loadHead(doc: Doc) {
  const root = getState().root;
  if (!root || !getState().git?.is_repo || !isInside(root, doc.path)) {
    doc.head = null;
    return;
  }
  try {
    doc.head = await api.gitHead(root, doc.path);
  } catch {
    doc.head = null;
  }
  views.forEach((v, g) => {
    if (v && shown[g] === doc.path) refreshGitGutter(v);
  });
}

/** Muat ulang isi HEAD untuk semua dokumen (setelah commit/checkout). */
export function refreshHeads() {
  for (const d of docs.values()) void loadHead(d);
}

// ---------- Buka / simpan / tutup ----------

export async function openDocument(path: string): Promise<Doc> {
  const existing = docs.get(path);
  if (existing) return existing;
  const file = await api.readText(path);
  const info = languageFor(basename(path));
  const doc: Doc = {
    path,
    saved: Text.of(file.content.split(/\r?\n/)),
    mtime: file.mtime_ms,
    eol: file.eol,
    langId: info.id,
    langName: info.name,
    language: null,
    states: [null, null],
    scroll: [0, 0],
    head: undefined,
    lsp: null,
    lspGroup: 0,
    indent: detectIndent(file.content, basename(path)),
  };
  docs.set(path, doc);
  void loadLanguage(doc);
  void loadHead(doc);
  void attachLsp(doc);
  return doc;
}

export function stateFor(doc: Doc, group: number): EditorState {
  let st = doc.states[group];
  if (!st) {
    const other = anyState(doc);
    st = createState(doc, group, other ? other.doc : doc.saved);
    doc.states[group] = st;
  }
  return st;
}

export function attachView(group: number, view: EditorView | null) {
  views[group] = view;
  if (!view) shown[group] = null;
}

export const shownPath = (group: number) => shown[group];

/** Simpan state view yang sedang tampil sebelum pindah tab. */
export function detachFromView(group: number, path: string | null) {
  const v = views[group];
  if (!v || !path) return;
  const d = docs.get(path);
  if (!d) return;
  if (shown[group] === path) {
    d.states[group] = v.state;
    d.scroll[group] = v.scrollDOM.scrollTop;
  }
  shown[group] = null;
}

export function showInView(group: number, path: string) {
  const v = views[group];
  const d = docs.get(path);
  if (!v || !d) return;
  v.setState(stateFor(d, group));
  shown[group] = path;
  v.dispatch({ effects: settingsComp.reconfigure(currentSettingsExt()) });
  void import("../debug/debug").then((m) => m.onEditorShown(group, path));
  const top = d.scroll[group];
  requestAnimationFrame(() => {
    if (views[group] === v) v.scrollDOM.scrollTop = top;
  });
}

/** Terapkan pengaturan editor baru ke semua view dan state tersimpan. */
export function applyEditorSettings() {
  const ext = currentSettingsExt();
  views.forEach((v) => v?.dispatch({ effects: settingsComp.reconfigure(ext) }));
  for (const d of docs.values()) {
    d.states = d.states.map((st, g) => {
      const v = views[g];
      if (!st || (v && v.state === st)) return st;
      return st.update({ effects: settingsComp.reconfigure(ext) }).state;
    });
  }
}

function withEol(doc: Doc, text: string) {
  return doc.eol === "crlf" ? text.replace(/\n/g, "\r\n") : text;
}

/** Simpan ke disk. Mengembalikan true kalau berhasil. */
export async function saveDocument(path: string, opts: { quiet?: boolean; force?: boolean } = {}): Promise<boolean> {
  const doc = docs.get(path);
  if (!doc) return false;
  const st = liveState(doc, 0) ?? liveState(doc, 1) ?? anyState(doc);
  if (!st) return true;
  const text = st.doc;
  const tab = getState().tabs[path];
  if (tab?.conflict && !opts.force) {
    const { resolveConflict } = await import("../app/conflicts");
    return resolveConflict(path);
  }
  try {
    // Deteksi berkas diubah di luar sejak terakhir dibaca.
    if (!opts.force) {
      const disk = await api.mtime(path).catch(() => 0);
      if (disk && doc.mtime && disk > doc.mtime + 1) {
        setState((s) => ({ tabs: { ...s.tabs, [path]: { ...s.tabs[path], conflict: true } } }));
        const { resolveConflict } = await import("../app/conflicts");
        return resolveConflict(path);
      }
    }
    const mtime = await api.writeText(path, withEol(doc, text.toString()));
    doc.saved = text;
    doc.mtime = mtime;
    // Edit selama proses simpan tetap dianggap belum tersimpan.
    const now = liveState(doc, 0) ?? liveState(doc, 1) ?? st;
    markDirty(doc, now.doc);
    setState((s) => (s.tabs[path] ? { tabs: { ...s.tabs, [path]: { ...s.tabs[path], conflict: false, missing: false } } } : {}));
    const { afterSave } = await import("../app/actions");
    afterSave(path, opts.quiet);
    if (!opts.quiet) void import("../components/PenguinMascot").then((m) => m.flashPenguin("jempol", 2500));
    return true;
  } catch (e) {
    const { toast } = await import("../state/store");
    toast(`Gagal menyimpan ${basename(path)}: ${errMsg(e)}`, "error");
    return false;
  }
}

/** Isi berkas berubah di disk. Kalau tidak ada editan lokal, muat ulang (tetap bisa di-undo). */
export async function externalChange(path: string): Promise<"reloaded" | "conflict" | "same" | "missing"> {
  const doc = docs.get(path);
  if (!doc) return "same";
  let file;
  try {
    file = await api.readText(path);
  } catch {
    setState((s) => (s.tabs[path] ? { tabs: { ...s.tabs, [path]: { ...s.tabs[path], missing: true } } } : {}));
    return "missing";
  }
  const incoming = file.content.replace(/\r\n/g, "\n");
  if (incoming === doc.saved.toString()) {
    doc.mtime = file.mtime_ms;
    return "same";
  }
  const tab = getState().tabs[path];
  if (tab?.dirty) {
    setState((s) => ({ tabs: { ...s.tabs, [path]: { ...s.tabs[path], conflict: true } } }));
    return "conflict";
  }
  replaceAll(doc, incoming);
  doc.saved = Text.of(incoming.split("\n"));
  doc.mtime = file.mtime_ms;
  doc.eol = file.eol;
  markDirty(doc, doc.saved);
  return "reloaded";
}

/** Ganti seluruh isi dokumen (sebagai transaksi, jadi bisa di-undo). */
export function replaceAll(doc: Doc, text: string) {
  for (let g = 0; g < doc.states.length; g++) {
    const st = liveState(doc, g);
    if (!st) continue;
    const change = minimalChange(st.doc.toString(), text);
    if (!change) continue;
    const spec = { changes: change, annotations: [syncAnno.of(true)] };
    const v = views[g];
    if (v && shown[g] === doc.path) v.dispatch(spec);
    else doc.states[g] = st.update(spec).state;
  }
  if (!anyState(doc)) doc.saved = Text.of(text.split("\n"));
}

export function setDocumentText(path: string, text: string) {
  const d = docs.get(path);
  if (d) replaceAll(d, text);
}

export function discardChanges(path: string) {
  const d = docs.get(path);
  if (!d) return;
  replaceAll(d, d.saved.toString());
}

/** Paksa muat ulang dari disk, membuang editan lokal. */
export async function reloadFromDisk(path: string) {
  const d = docs.get(path);
  if (!d) return;
  const file = await api.readText(path);
  const text = file.content.replace(/\r\n/g, "\n");
  replaceAll(d, text);
  d.saved = Text.of(text.split("\n"));
  d.mtime = file.mtime_ms;
  d.eol = file.eol;
  markDirty(d, d.saved);
  setState((s) => (s.tabs[path] ? { tabs: { ...s.tabs, [path]: { ...s.tabs[path], conflict: false, missing: false } } } : {}));
}

export function closeDocument(path: string) {
  docs.delete(path);
  clearTimeout(previewTimers.get(path));
  clearTimeout(autoSaveTimers.get(path));
  setState((s) => {
    if (!(path in s.problems)) return {};
    const p = { ...s.problems };
    delete p[path];
    return { problems: p };
  });
}

/**
 * Pindahkan state editor (undo, kursor, fold, koneksi LSP) dari satu grup ke grup lain —
 * dipakai saat grup kiri kosong atau split digabung, supaya berkas tidak dibuka ulang dari nol.
 */
export function moveGroupState(path: string, from: number, to: number) {
  const d = docs.get(path);
  if (!d || from === to) return;
  const v = views[from];
  const st = v && shown[from] === path ? v.state : d.states[from];
  if (st && !d.states[to]) {
    d.states[to] = st;
    d.scroll[to] = d.scroll[from];
  }
  d.states[from] = null;
  if (d.lspGroup === from) d.lspGroup = to;
}

export function forgetGroupState(group: number, path: string) {
  const d = docs.get(path);
  if (d) d.states[group] = null;
}

/** Pindahkan dokumen ke path baru (setelah rename/move). */
export function renameDocument(oldPath: string, newPath: string) {
  const d = docs.get(oldPath);
  if (!d) return;
  docs.delete(oldPath);
  d.path = newPath;
  docs.set(newPath, d);
}

export function selectionText(group: number): string {
  const v = views[group];
  if (!v) return "";
  return v.state.selection.ranges.map((r) => v.state.sliceDoc(r.from, r.to)).join("\n");
}

/** Seleksi utama di editor grup: teks dan rentang baris (1-based). null bila kosong. */
export function selectionInfo(group: number): { text: string; from: number; to: number } | null {
  const v = views[group];
  if (!v) return null;
  const r = v.state.selection.main;
  if (r.empty) return null;
  const from = v.state.doc.lineAt(r.from).number;
  const to = v.state.doc.lineAt(r.to).number;
  return { text: v.state.sliceDoc(r.from, r.to), from, to };
}

export function revealPosition(group: number, line: number, col = 1, len = 0) {
  const v = views[group];
  if (!v) return;
  const doc = v.state.doc;
  const l = doc.line(Math.min(Math.max(1, line), doc.lines));
  const from = Math.min(l.from + Math.max(0, col - 1), l.to);
  const to = Math.min(from + len, l.to);
  v.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
  v.focus();
}

export function insertAtCursor(group: number, text: string) {
  const v = views[group];
  if (!v) return false;
  v.dispatch(v.state.replaceSelection(text));
  v.focus();
  return true;
}

export function focusEditor(group: number) {
  views[group]?.focus();
}

/** Kunci dokumen terbuka yang ada di dalam folder `dir` (untuk hapus/rename folder). */
export function docsUnder(dir: string): string[] {
  return [...docs.keys()].filter((p) => p === dir || p.startsWith(dir + "/"));
}
