// "Perbaiki dengan AI": error/peringatan di posisi kursor dikirim ke agen yang dipilih bersama
// potongan kode di sekitarnya. Agen mengubah berkas lewat alurnya sendiri, jadi checkpoint &
// tinjauan per bagian ikut berlaku.

import { forEachDiagnostic, type Action } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { tl } from "../i18n";
import { activeTab, getState, toast, type Problem } from "../state/store";
import * as docs from "./documents";

/** Masalah (lint maupun server bahasa) di baris kursor, yang paling parah dulu. */
export function problemsAtCursor(view: EditorView): Problem[] {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const out: Problem[] = [];
  forEachDiagnostic(view.state, (d, from, to) => {
    if (to < line.from || from > line.to) return;
    const l = view.state.doc.lineAt(Math.min(from, view.state.doc.length));
    out.push({ line: l.number, col: from - l.from + 1, message: d.message, severity: d.severity === "hint" ? "info" : (d.severity as Problem["severity"]), source: d.source });
  });
  const rank = { error: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export async function fixProblem(path: string, p: Problem) {
  const { fixProblemWithAgent } = await import("../claude/claude");
  await fixProblemWithAgent(path, p);
}

/** Perintah Mod+. / menu konteks: perbaiki masalah di baris kursor berkas aktif. */
export async function fixAtCursor() {
  const s = getState();
  const tab = activeTab();
  const view = docs.viewOf(s.focusedGroup);
  if (!tab || tab.kind !== "text" || !view) return;
  const p = problemsAtCursor(view)[0];
  if (!p) return toast(tl("Tidak ada error atau peringatan di baris ini."));
  await fixProblem(tab.id, p);
}

/** Aksi di tooltip diagnostik (lampu "Perbaiki dengan AI"). */
export function fixAction(path: string): Action {
  return {
    name: tl("Perbaiki dengan AI"),
    apply: (view, from) => {
      const line = view.state.doc.lineAt(Math.min(from, view.state.doc.length));
      const d = problemsAtCursor(view).find((x) => x.line === line.number);
      void fixProblem(path, d ?? { line: line.number, col: from - line.from + 1, message: "", severity: "error" });
    },
  };
}
