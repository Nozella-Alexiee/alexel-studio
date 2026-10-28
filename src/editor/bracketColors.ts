// Pewarnaan pasangan kurung per kedalaman (seperti "bracket pair colorization" VS Code).
// Memakai pohon sintaks Lezer bila ada (kurung di string/komentar tidak ikut); tanpa pohon,
// teks dipindai langsung. Kedalaman dihitung dari awal dokumen sampai akhir viewport.

import { RangeSetBuilder, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

const OPEN = "([{";
const CLOSE = ")]}";
const MAX_SCAN = 400_000;
const marks = [0, 1, 2].map((i) => Decoration.mark({ class: `cm-bracket-${i}` }));
const unmatched = Decoration.mark({ class: "cm-bracket-bad" });

/** Posisi kurung + kedalamannya dari teks polos (dipakai tanpa pohon sintaks; juga dites). */
export function scanBrackets(text: string, offset = 0): { pos: number; depth: number; bad?: boolean }[] {
  const stack: string[] = [];
  const out: { pos: number; depth: number; bad?: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const o = OPEN.indexOf(ch);
    if (o >= 0) {
      out.push({ pos: offset + i, depth: stack.length });
      stack.push(CLOSE[o]);
      continue;
    }
    if (CLOSE.includes(ch)) {
      if (stack[stack.length - 1] === ch) {
        stack.pop();
        out.push({ pos: offset + i, depth: stack.length });
      } else out.push({ pos: offset + i, depth: 0, bad: true });
    }
  }
  return out;
}

function fromTree(state: EditorState, end: number): { pos: number; depth: number; bad?: boolean }[] | null {
  const tree = syntaxTree(state);
  if (!tree.length) return null;
  const out: { pos: number; depth: number; bad?: boolean }[] = [];
  const stack: string[] = [];
  tree.iterate({
    from: 0,
    to: end,
    enter(n) {
      if (n.to - n.from !== 1) return;
      const ch = state.doc.sliceString(n.from, n.to);
      const o = OPEN.indexOf(ch);
      if (o >= 0 && n.name === ch) {
        out.push({ pos: n.from, depth: stack.length });
        stack.push(CLOSE[o]);
      } else if (CLOSE.includes(ch) && n.name === ch) {
        if (stack[stack.length - 1] === ch) {
          stack.pop();
          out.push({ pos: n.from, depth: stack.length });
        } else out.push({ pos: n.from, depth: 0, bad: true });
      }
    },
  });
  return out;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const end = Math.min(state.doc.length, view.viewport.to);
  if (end > MAX_SCAN) return Decoration.none;
  const list = fromTree(state, end) ?? scanBrackets(state.doc.sliceString(0, end));
  const from = view.viewport.from;
  const b = new RangeSetBuilder<Decoration>();
  for (const x of list) if (x.pos >= from) b.add(x.pos, x.pos + 1, x.bad ? unmatched : marks[x.depth % 3]);
  return b.finish();
}

export const bracketColors: Extension = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view);
      }
    },
    { decorations: (p) => p.decorations }
  ),
  EditorView.theme({
    ".cm-bracket-0": { color: "var(--bracket-0, #e5c07b)" },
    ".cm-bracket-1": { color: "var(--bracket-1, #c678dd)" },
    ".cm-bracket-2": { color: "var(--bracket-2, #56b6c2)" },
    ".cm-bracket-bad": { color: "var(--danger)" },
  }),
];
