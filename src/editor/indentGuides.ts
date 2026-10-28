// Garis bantu indentasi (seperti VS Code): satu garis tipis tiap level indent, juga di baris kosong
// (mengikuti level terkecil baris berisi di atas & bawahnya). Digambar sebagai latar baris supaya
// tidak mengubah teks atau posisi kursor.

import { RangeSetBuilder, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { getIndentUnit } from "@codemirror/language";

/** Lebar indent (kolom) sebuah baris; null untuk baris kosong/spasi saja. Tab dihitung `tabSize`. */
export function indentColumns(line: string, tabSize: number): number | null {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col++;
    else if (ch === "\t") col += tabSize - (col % tabSize);
    else return col;
  }
  return null;
}

/** Level garis per baris [from..to] (1-based), memakai baris berisi terdekat untuk baris kosong. */
export function guideLevels(doc: Pick<Text, "lines" | "line">, from: number, to: number, unit: number, tabSize: number, scan = 200): number[] {
  const cols = (n: number) => indentColumns(doc.line(n).text, tabSize);
  const out: number[] = [];
  for (let n = from; n <= to; n++) {
    let c = cols(n);
    if (c === null) {
      let up: number | null = null;
      let down: number | null = null;
      for (let i = n - 1; i >= Math.max(1, n - scan) && up === null; i--) up = cols(i);
      for (let i = n + 1; i <= Math.min(doc.lines, n + scan) && down === null; i++) down = cols(i);
      c = Math.min(up ?? 0, down ?? 0);
    }
    out.push(Math.floor(c / Math.max(1, unit)));
  }
  return out;
}

const cache = new Map<string, Decoration>();
function lineDeco(levels: number, unit: number): Decoration {
  const key = `${levels}:${unit}`;
  let d = cache.get(key);
  if (!d) {
    const imgs: string[] = [];
    const pos: string[] = [];
    for (let k = 0; k < levels; k++) {
      imgs.push("linear-gradient(var(--indent-guide), var(--indent-guide))");
      pos.push(`calc(6px + ${k * unit}ch) 0`);
    }
    d = Decoration.line({ attributes: { style: `background-image:${imgs.join(",")};background-position:${pos.join(",")};background-size:1px 100%;background-repeat:no-repeat` } });
    cache.set(key, d);
  }
  return d;
}

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const tabSize = state.tabSize;
  const unitStr = getIndentUnit(state);
  const unit = typeof unitStr === "number" ? unitStr : tabSize;
  for (const { from, to } of view.visibleRanges) {
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    const levels = guideLevels(state.doc, first, last, unit, tabSize);
    for (let n = first; n <= last; n++) {
      const lv = levels[n - first];
      if (lv > 0) b.add(state.doc.line(n).from, state.doc.line(n).from, lineDeco(Math.min(lv, 24), unit));
    }
  }
  return b.finish();
}

export const indentGuides: Extension = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (p) => p.decorations }
  ),
  EditorView.theme({ "&": { "--indent-guide": "color-mix(in srgb, var(--fg-subtle) 28%, transparent)" } }),
];
