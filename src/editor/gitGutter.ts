// Penanda perubahan git di gutter (baris baru / diubah / dihapus dibanding HEAD).

import { Facet, RangeSet, StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from "@codemirror/view";
import { lineChanges, type LineChange } from "../lib/diff";

/** Sumber isi HEAD untuk dokumen ini (undefined = belum dimuat, null = bukan berkas git). */
export const headSource = Facet.define<() => string | null | undefined, () => string | null | undefined>({
  combine: (v) => v[0] ?? (() => null),
});

export const setGitChanges = StateEffect.define<LineChange[]>();

class Mark extends GutterMarker {
  constructor(readonly kind: "add" | "mod" | "del") {
    super();
  }
  eq(o: Mark) {
    return o.kind === this.kind;
  }
  toDOM() {
    const d = document.createElement("div");
    d.className = `cm-git-mark cm-git-${this.kind}`;
    return d;
  }
}
const MARKS = { add: new Mark("add"), mod: new Mark("mod"), del: new Mark("del") };

export interface GitGutterState {
  changes: LineChange[];
  set: RangeSet<GutterMarker>;
}

export const gitField = StateField.define<GitGutterState>({
  create: () => ({ changes: [], set: RangeSet.empty }),
  update(v, tr) {
    for (const e of tr.effects) {
      if (e.is(setGitChanges)) {
        const doc = tr.state.doc;
        const ranges: Range<GutterMarker>[] = [];
        for (const c of e.value) {
          if (c.type === "del") {
            const ln = Math.min(Math.max(c.at, 1), doc.lines);
            ranges.push(MARKS.del.range(doc.line(ln).from));
          } else {
            for (let l = c.from; l <= Math.min(c.to, doc.lines); l++) ranges.push(MARKS[c.type].range(doc.line(l).from));
          }
        }
        return { changes: e.value, set: RangeSet.of(ranges, true) };
      }
    }
    return tr.docChanged ? { changes: v.changes, set: v.set.map(tr.changes) } : v;
  },
});

const updater = ViewPlugin.fromClass(
  class {
    timer = 0;
    constructor(readonly view: EditorView) {
      this.schedule(60);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.schedule(400);
    }
    schedule(ms: number) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.run(), ms);
    }
    run() {
      const head = this.view.state.facet(headSource)();
      if (head === undefined) return this.schedule(500);
      const changes = head === null ? [] : lineChanges(head, this.view.state.doc.toString());
      this.view.dispatch({ effects: setGitChanges.of(changes) });
    }
    destroy() {
      clearTimeout(this.timer);
    }
  }
);

/** Paksa hitung ulang (mis. setelah commit atau HEAD berubah). */
export function refreshGitGutter(view: EditorView) {
  const p = view.plugin(updater);
  p?.schedule(10);
}

/** Klik penanda: (view, nomor baris 1-based, event) → true bila ditangani. */
export type HunkClick = (view: EditorView, line: number, ev: MouseEvent) => boolean;

export function gitGutter(getHead: () => string | null | undefined, onClick?: HunkClick): Extension {
  return [
    headSource.of(getHead),
    gitField,
    updater,
    gutter({
      class: "cm-git-gutter",
      markers: (v) => v.state.field(gitField).set,
      domEventHandlers: onClick
        ? {
            mousedown: (view, block, ev) => {
              const line = view.state.doc.lineAt(block.from).number;
              let marked = false;
              view.state.field(gitField).set.between(block.from, block.from, () => {
                marked = true;
              });
              return marked && onClick(view, line, ev as MouseEvent);
            },
          }
        : {},
    }),
  ];
}
