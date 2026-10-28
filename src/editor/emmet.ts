// Emmet: ketik singkatan lalu Tab, mis. `ul>li*3.item` atau `m10` di CSS (seperti VS Code).
// Memakai pustaka inti `emmet` (MIT). Di JSX/TSX hanya singkatan dengan operator Emmet (. # > * +)
// yang diperluas, supaya Tab di kode JavaScript biasa tetap berfungsi normal.

import { completionStatus, snippet } from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import expand, { extract } from "emmet";
import { getState } from "../state/store";

type Kind = { type: "markup" | "stylesheet"; syntax: string; strict?: boolean };

/** Berkas → mode Emmet (dari ekstensi berkas); null = Emmet tidak dipakai. */
export function emmetKind(path: string): Kind | null {
  const ext = /\.([^./\\]+)$/.exec(path.toLowerCase())?.[1] ?? "";
  if (["html", "htm", "vue", "svelte", "astro", "php", "erb", "hbs", "njk", "twig"].includes(ext)) return { type: "markup", syntax: "html" };
  if (["xml", "svg", "xsl"].includes(ext)) return { type: "markup", syntax: "xml" };
  if (ext === "jsx" || ext === "tsx") return { type: "markup", syntax: "jsx", strict: true };
  if (ext === "css") return { type: "stylesheet", syntax: "css" };
  if (ext === "scss" || ext === "less" || ext === "sass" || ext === "styl") return { type: "stylesheet", syntax: ext === "styl" ? "stylus" : ext };
  return null;
}

const field = (i: number, p: string) => `\${${i}${p ? `:${p}` : ""}}`;

/** Singkatan sebelum kolom `col` di `line` → hasil perluasan (template snippet) atau null. */
export function expandAt(line: string, col: number, kind: Kind): { start: number; end: number; template: string } | null {
  const ex = extract(line, col, { type: kind.type, lookAhead: kind.type === "markup" });
  if (!ex || !ex.abbreviation) return null;
  const abbr = ex.abbreviation;
  if (kind.strict && !/^[A-Za-z][\w:-]*(?:[.#>*+^[(]|$)/.test(abbr)) return null;
  if (kind.strict && !/[.#>*+^[]/.test(abbr)) return null;
  // Kata biasa di CSS (mis. nilai `bold`) tetap diperluas oleh Emmet; batasi ke singkatan pendek tanpa spasi.
  if (/\s/.test(abbr)) return null;
  try {
    const template = expand(abbr, { type: kind.type, syntax: kind.syntax, options: { "output.field": field } });
    if (!template || template === abbr) return null;
    return { start: ex.start, end: ex.end, template };
  } catch {
    return null;
  }
}

function run(view: EditorView, kind: Kind): boolean {
  if (!getState().settings.emmet) return false;
  if (completionStatus(view.state) === "active") return false;
  const sel = view.state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return false;
  const line = view.state.doc.lineAt(sel.main.head);
  const r = expandAt(line.text, sel.main.head - line.from, kind);
  if (!r) return false;
  snippet(r.template)(view, null, line.from + r.start, line.from + r.end);
  return true;
}

export function emmetExtension(path: string): Extension {
  const kind = emmetKind(path);
  if (!kind) return [];
  return Prec.high(keymap.of([{ key: "Tab", run: (v) => run(v, kind) }]));
}
