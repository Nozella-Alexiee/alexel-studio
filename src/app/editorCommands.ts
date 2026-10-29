// Aksi editor untuk menu & palette (seperti menu Edit/Seleksi/Pergi di VS Code).
// Semua bekerja pada editor grup yang sedang fokus.

import { addCursorAbove, addCursorBelow, copyLineDown, copyLineUp, moveLineDown, moveLineUp, redo, selectAll, selectLine, selectParentSyntax, toggleComment, undo } from "@codemirror/commands";
import { findReferences, formatDocument, jumpToDefinition, LSPPlugin, renameSymbol } from "@codemirror/lsp-client";
import { openSearchPanel, selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";
import type { Command, EditorView } from "@codemirror/view";
import * as docs from "../editor/documents";
import { call } from "../lib/ipc";
import { prettierParser, formatWithPrettier, projectPrettierOptions } from "../editor/prettierFormat";
import { activeTab, getState, promptDialog, setState, toast } from "../state/store";
import { tl } from "../i18n";

const view = (): EditorView | null => docs.viewOf(getState().focusedGroup) ?? null;

/** Jalankan perintah CodeMirror di editor aktif. */
export function onEditor(cmd: Command): () => void {
  return () => {
    const v = view();
    if (!v) return;
    v.focus();
    cmd(v);
  };
}

const needLsp = (fn: (v: EditorView) => boolean | void, what: string) => () => {
  const v = view();
  if (!v) return;
  if (!LSPPlugin.get(v)) return toast(tl("{what} butuh server bahasa untuk berkas ini. Lihat Pengaturan → Server bahasa.", { what: tl(what) }));
  v.focus();
  fn(v);
};

/**
 * Potong/salin/tempel/urungkan: di editor memakai perintah CodeMirror, di kolom teks lain
 * memakai aksi bawaan Chromium (lewat main process).
 */
export function editAction(action: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll") {
  const v = view();
  // Seleksi/fokus di tampilan teks non-editor (Debug Console, Output, chat…): jangan pindah fokus ke editor.
  const active = document.activeElement as HTMLElement | null;
  const sel = window.getSelection();
  const selOutsideEditor = !!sel && !sel.isCollapsed && !!sel.anchorNode && !sel.anchorNode.parentElement?.closest(".cm-editor") && !sel.anchorNode.parentElement?.closest("input, textarea");
  if (action === "copy" && selOutsideEditor) return void call("edit_action", { action });
  const selectable = active?.closest?.<HTMLElement>(".selectable");
  if (action === "selectAll" && selectable) {
    const r = document.createRange();
    r.selectNodeContents(selectable);
    sel?.removeAllRanges();
    sel?.addRange(r);
    return;
  }
  const inEditor = !!v && (v.hasFocus || !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement));
  if (inEditor && v && (action === "undo" || action === "redo" || action === "selectAll")) {
    v.focus();
    (action === "undo" ? undo : action === "redo" ? redo : selectAll)(v);
    return;
  }
  if (inEditor && v) v.focus();
  void call("edit_action", { action });
}

export const find = onEditor(openSearchPanel);
export function replace() {
  const v = view();
  if (!v) return;
  openSearchPanel(v);
  requestAnimationFrame(() => (v.dom.querySelector(".cm-search input[name=replace]") as HTMLInputElement | null)?.focus());
}
export const comment = onEditor(toggleComment);
const lspFormat = needLsp((v) => formatDocument(v), "Rapikan dokumen");

/** Rapikan dokumen: Prettier untuk JS/TS/JSON/CSS/HTML/Markdown/YAML, selain itu lewat server bahasa. */
export function format() {
  const v = view();
  const tab = activeTab();
  if (v && tab?.kind === "text") {
    const path = tab.id;
    void import("../exthost/features").then(async (f) => {
      // Formatter yang didaftarkan ekstensi dipakai lebih dulu (pemakai memasangnya dengan sengaja).
      // Formatter ekstensi gagal/macet → tetap rapikan dengan bawaan.
      if (f.hostProviders("formatting", path).length && (await f.hostFormat(path, v, getState().settings.tabSize).catch(() => false))) return;
      formatBuiltin();
    });
    return;
  }
  formatBuiltin();
}

function formatBuiltin() {
  const v = view();
  const tab = activeTab();
  if (!v || !tab || tab.kind !== "text" || !prettierParser(tab.id)) return lspFormat();
  v.focus();
  void formatWithPrettierInView(v, tab.id);
}

async function formatWithPrettierInView(v: EditorView, path: string) {
  const s = getState();
  try {
    const before = v.state.doc.toString();
    const out = await formatWithPrettier(before, path, { tabWidth: s.settings.tabSize, useTabs: false }, await projectPrettierOptions(s.root));
    if (out == null || out === before) return;
    // Dokumen berubah selama Prettier bekerja: jangan menimpa ketikan baru.
    if (v.state.doc.toString() !== before) return toast(tl("Dokumen berubah saat dirapikan; coba lagi."));
    const head = Math.min(v.state.selection.main.head, out.length);
    v.dispatch({ changes: { from: 0, to: before.length, insert: out }, selection: { anchor: head }, userEvent: "format" });
  } catch (e) {
    toast(tl("Prettier: {error}", { error: (e instanceof Error ? e.message : String(e)).split("\n")[0] }), "error");
  }
}
/** Server bahasa dulu; bila tidak ada, provider dari ekstensi (extension host). */
const lspOrHost = (what: string, lsp: (v: EditorView) => boolean | void, host: (path: string, v: EditorView) => Promise<boolean>) => () => {
  const v = view();
  const tab = activeTab();
  if (!v) return;
  if (LSPPlugin.get(v)) {
    v.focus();
    lsp(v);
    return;
  }
  if (tab?.kind === "text") {
    v.focus();
    void host(tab.id, v)
      .catch(() => false)
      .then((done) => !done && toast(tl("{what} butuh server bahasa untuk berkas ini. Lihat Pengaturan → Server bahasa.", { what: tl(what) })));
    return;
  }
  toast(tl("{what} butuh server bahasa untuk berkas ini. Lihat Pengaturan → Server bahasa.", { what: tl(what) }));
};

export const definition = lspOrHost("Ke definisi", (v) => jumpToDefinition(v), async (path, v) => (await import("../exthost/features")).hostDefinition(path, v));
export const references = lspOrHost("Cari referensi", (v) => findReferences(v), async (path, v) => {
  const list = await (await import("../exthost/features")).hostReferences(path, v);
  if (list === null) return false;
  if (!list.length) return toast(tl("Tidak ada referensi."), "info"), true;
  const { uriToPath } = await import("../editor/lsp");
  const A = await import("./actions");
  const root = getState().root ?? "";
  const picked = await new Promise<number[] | null>((resolve) =>
    setState({ quickPick: { items: list.map((l) => ({ label: `${uriToPath(l.uri).replace(root + "/", "")}:${l.range.s.l + 1}`, description: "" })), canPickMany: false, placeHolder: tl("{n} referensi", { n: list.length }), resolve } })
  );
  if (picked?.length) await A.openFile(uriToPath(list[picked[0]].uri), { line: list[picked[0]].range.s.l + 1, col: list[picked[0]].range.s.c + 1 });
  return true;
});
export const rename = lspOrHost("Ganti nama simbol", (v) => renameSymbol(v), async (path, v) => {
  const feats = await import("../exthost/features");
  if (!feats.hostProviders("rename", path).length) return false;
  const word = v.state.wordAt(v.state.selection.main.head);
  const name = await promptDialog(tl("Ganti nama simbol"), { defaultValue: word ? v.state.sliceDoc(word.from, word.to) : "", okLabel: tl("Ganti nama") });
  if (!name) return true;
  const r = await feats.hostRename(path, v, name);
  if (r?.error) toast(r.error, "error");
  for (const f of r?.files ?? []) await docs.applyTextEdits((await import("../editor/lsp")).uriToPath(f.uri), f.edits);
  return true;
});
export const lineDown = onEditor(copyLineDown);
export const lineUp = onEditor(copyLineUp);
export const moveDown = onEditor(moveLineDown);
export const moveUp = onEditor(moveLineUp);
export const cursorAbove = onEditor(addCursorAbove);
export const cursorBelow = onEditor(addCursorBelow);
export const nextOccurrence = onEditor(selectNextOccurrence);
export const allOccurrences = onEditor(selectSelectionMatches);
export const expandSelection = onEditor(selectParentSyntax);
export const selectCurrentLine = onEditor(selectLine);
