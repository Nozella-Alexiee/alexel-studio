// Menyinkronkan dokumen & editor aktif ke extension host (buka / ubah / simpan / tutup / seleksi).

import type { EditorState } from "@codemirror/state";
import * as docs from "../editor/documents";
import { fileUri } from "../editor/lsp";
import { activeTab, getState, onProblemsFrom, useStore } from "../state/store";
import { hostNotify } from "./client";
import { vscodeLanguageId } from "./lang";

let off: (() => void)[] = [];
const versions = new Map<string, number>();
const bump = (path: string) => {
  const v = (versions.get(path) ?? 0) + 1;
  versions.set(path, v);
  return v;
};

const pos = (state: EditorState, offset: number) => {
  const line = state.doc.lineAt(Math.min(offset, state.doc.length));
  return { l: line.number - 1, c: offset - line.from };
};

function editorInfo(path: string, state: EditorState) {
  const s = getState().settings;
  return {
    uri: fileUri(path),
    selections: state.selection.ranges.map((r) => ({ anchor: pos(state, r.anchor), active: pos(state, r.head) })),
    options: { tabSize: s.tabSize, insertSpaces: true },
  };
}

function open(doc: docs.Doc) {
  const text = docs.currentText(doc.path) ?? doc.saved.toString();
  hostNotify("doc/open", { uri: fileUri(doc.path), languageId: vscodeLanguageId(doc.path, doc.langId), version: bump(doc.path), text, eol: doc.eol === "crlf" ? 2 : 1 });
}

function activeEditor() {
  const t = activeTab();
  if (!t || t.kind !== "text") return hostNotify("editor/active", null);
  const g = getState().focusedGroup;
  const v = docs.viewOf(g);
  if (v && docs.shownPath(g) === t.id) hostNotify("editor/active", editorInfo(t.id, v.state));
  else hostNotify("editor/active", null);
}

export function startSync() {
  stopSync();
  for (const d of docs.openDocs()) open(d);
  activeEditor();
  for (const [path, list] of Object.entries(getState().problems)) {
    hostNotify("diag/external", { source: "initial", uri: fileUri(path), items: list.map((p) => ({ range: { s: { l: p.line - 1, c: p.col - 1 }, e: { l: p.line - 1, c: p.col } }, message: p.message, severity: p.severity === "error" ? 0 : p.severity === "warning" ? 1 : 2, source: p.source })) });
  }
  off.push(
    docs.onDocEvent((e) => {
      switch (e.type) {
        case "open":
          open(e.doc);
          break;
        case "change": {
          const changes: { start: number; end: number; text: string }[] = [];
          e.update.changes.iterChanges((a, b, _c, _d, ins) => changes.push({ start: a, end: b, text: ins.toString() }));
          hostNotify("doc/change", { uri: fileUri(e.path), version: bump(e.path), changes });
          break;
        }
        case "replace":
          hostNotify("doc/change", { uri: fileUri(e.path), version: bump(e.path), changes: [], text: e.text });
          break;
        case "selection":
          hostNotify("editor/selection", editorInfo(e.path, e.state));
          break;
        case "save":
          hostNotify("doc/save", { uri: fileUri(e.path) });
          break;
        case "close":
          hostNotify("doc/close", { uri: fileUri(e.path) });
          versions.delete(e.path);
          break;
        case "rename": {
          hostNotify("doc/close", { uri: fileUri(e.from) });
          const d = docs.getDoc(e.to);
          if (d) open(d);
          break;
        }
      }
    })
  );
  // Diagnostik dari linter bawaan & server bahasa terlihat oleh ekstensi (languages.getDiagnostics, ErrorLens, …).
  off.push(
    onProblemsFrom((source, path, list) => {
      if (source.startsWith("host:")) return;
      hostNotify("diag/external", { source, uri: fileUri(path), items: list.map((p) => ({ range: { s: { l: p.line - 1, c: p.col - 1 }, e: { l: p.line - 1, c: p.col } }, message: p.message, severity: p.severity === "error" ? 0 : p.severity === "warning" ? 1 : 2, source: p.source })) });
    })
  );
  let last = "";
  off.push(
    useStore.subscribe((s) => {
      const id = s.groups[s.focusedGroup]?.active ?? "";
      if (id === last) return;
      last = id;
      requestAnimationFrame(() => requestAnimationFrame(activeEditor));
    })
  );
}

export function stopSync() {
  off.forEach((f) => f());
  off = [];
}
