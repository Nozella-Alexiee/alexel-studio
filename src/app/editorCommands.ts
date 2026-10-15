// Aksi editor untuk menu & palette (seperti menu Edit/Seleksi/Pergi di VS Code).
// Semua bekerja pada editor grup yang sedang fokus.

import { addCursorAbove, addCursorBelow, copyLineDown, copyLineUp, moveLineDown, moveLineUp, redo, selectAll, selectLine, selectParentSyntax, toggleComment, undo } from "@codemirror/commands";
import { findReferences, formatDocument, jumpToDefinition, LSPPlugin, renameSymbol } from "@codemirror/lsp-client";
import { openSearchPanel, selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";
import type { Command, EditorView } from "@codemirror/view";
import * as docs from "../editor/documents";
import { call } from "../lib/ipc";
import { getState, toast } from "../state/store";

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
  if (!LSPPlugin.get(v)) return toast(`${what} butuh server bahasa untuk berkas ini. Lihat Pengaturan → Server bahasa.`);
  v.focus();
  fn(v);
};

/**
 * Potong/salin/tempel/urungkan: di editor memakai perintah CodeMirror, di kolom teks lain
 * memakai aksi bawaan Chromium (lewat main process).
 */
export function editAction(action: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll") {
  const v = view();
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
export const format = needLsp((v) => formatDocument(v), "Rapikan dokumen");
export const definition = needLsp((v) => jumpToDefinition(v), "Ke definisi");
export const references = needLsp((v) => findReferences(v), "Cari referensi");
export const rename = needLsp((v) => renameSymbol(v), "Ganti nama simbol");
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
