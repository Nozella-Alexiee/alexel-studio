// Linter ringan dan hati-hati: hanya melaporkan error sintaks yang benar-benar
// ditemukan parser Lezer (setelah parse lengkap), plus validasi JSON yang tepat.
// Heuristik baris-per-baris lama dibuang karena banyak salah tandai.

import { syntaxTree, syntaxTreeAvailable, forceParsing } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorState, Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { tl } from "../i18n";

/** Bahasa dengan grammar Lezer yang cukup akurat untuk dijadikan sumber error. */
const RELIABLE = new Set(["js", "ts", "json", "jsonc", "css", "py", "rs", "go", "java", "c", "cpp", "php", "yaml", "xml"]);

const MAX_LINT_BYTES = 600_000;

export function lezerDiagnostics(state: EditorState): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<number>();
  const len = state.doc.length;
  syntaxTree(state).iterate({
    enter(node) {
      if (!node.type.isError) return;
      const from = Math.min(node.from, len);
      const line = state.doc.lineAt(from);
      if (seen.has(line.number)) return false;
      seen.add(line.number);
      let to = Math.max(node.to, from + 1);
      if (to > line.to) to = Math.max(line.to, from);
      if (from === to && from > 0) {
        out.push({ from: from - 1, to: from, severity: "error", message: tl("Sintaks tidak lengkap di sini."), source: "Sintaks" });
        return false;
      }
      const snippet = state.sliceDoc(from, Math.min(to, from + 24)).trim();
      out.push({
        from,
        to,
        severity: "error",
        message: snippet ? `Sintaks tidak dikenali dekat "${snippet}"` : "Sintaks tidak lengkap di sini.",
        source: "Sintaks",
      });
      if (out.length >= 50) return false;
    },
  });
  return out;
}

/** Posisi error JSON.parse di berbagai engine (V8: "position N", WebKit: "line L column C"). */
export function jsonDiagnostics(doc: string): Diagnostic[] {
  if (!doc.trim()) return [];
  try {
    JSON.parse(doc);
    return [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let pos = 0;
    const p = msg.match(/position\s+(\d+)/i);
    const lc = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (p) pos = Number(p[1]);
    else if (lc) {
      const lines = doc.split("\n");
      const ln = Math.min(Number(lc[1]), lines.length) - 1;
      pos = lines.slice(0, ln).reduce((a, l) => a + l.length + 1, 0) + Math.max(0, Number(lc[2]) - 1);
    } else pos = doc.length;
    pos = Math.max(0, Math.min(pos, doc.length));
    const from = pos >= doc.length ? Math.max(0, doc.length - 1) : pos;
    return [
      {
        from,
        to: Math.min(doc.length, from + 1),
        severity: "error",
        message: tl("JSON tidak valid: ") + msg.replace(/^JSON\.parse:\s*/i, "").replace(/^Unexpected/, "Tidak terduga"),
        source: "JSON",
      },
    ];
  }
}

export function computeDiagnostics(langId: string, state: EditorState): Diagnostic[] {
  if (state.doc.length > MAX_LINT_BYTES || !RELIABLE.has(langId)) return [];
  if (langId === "json") return jsonDiagnostics(state.doc.toString());
  return lezerDiagnostics(state);
}

export function nozelLinter(langId: string, delay: number, onResult: (d: Diagnostic[], state: EditorState) => void): Extension {
  return linter(
    (view: EditorView) => {
      const state = view.state;
      // Jangan melapor kalau parser belum selesai: pohon setengah jadi penuh error palsu.
      if (!syntaxTreeAvailable(state, state.doc.length)) {
        forceParsing(view, state.doc.length, 120);
        if (!syntaxTreeAvailable(view.state, state.doc.length)) {
          onResult([], state);
          return [];
        }
      }
      const d = computeDiagnostics(langId, view.state);
      onResult(d, view.state);
      return d;
    },
    { delay }
  );
}
