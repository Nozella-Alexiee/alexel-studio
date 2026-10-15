// Integrasi debugger di editor: gutter breakpoint (klik di kiri nomor baris), sorotan baris
// tempat program berhenti, dan nilai variabel saat kursor diarahkan ketika debug berhenti.

import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, gutter, GutterMarker, hoverTooltip, type DecorationSet } from "@codemirror/view";
import { dbg, setDbg, type Breakpoint } from "./state";
import { tl } from "../i18n";

class BpMarker extends GutterMarker {
  constructor(readonly verified: boolean, readonly conditional: boolean) {
    super();
  }
  eq(o: BpMarker) {
    return o.verified === this.verified && o.conditional === this.conditional;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-bp ${this.verified ? "" : "is-unverified"} ${this.conditional ? "is-cond" : ""}`;
    el.title = this.conditional ? tl("Breakpoint bersyarat") : this.verified ? "Breakpoint" : tl("Breakpoint (belum terikat)");
    return el;
  }
}

/** Ganti seluruh breakpoint dokumen (dari store). */
export const setBpsEffect = StateEffect.define<Breakpoint[]>();
const markerFor = (b: Breakpoint) => new BpMarker(b.verified !== false, !!b.condition);

function fromList(doc: { lines: number; line: (n: number) => { from: number } }, list: Breakpoint[]) {
  return RangeSet.of(
    list.filter((b) => b.line >= 1 && b.line <= doc.lines).map((b) => markerFor(b).range(doc.line(b.line).from)),
    true
  );
}

/** Baris breakpoint saat ini dari state editor (setelah teks berubah). */
function linesOf(view: EditorView, set: RangeSet<GutterMarker>): number[] {
  const out: number[] = [];
  set.between(0, view.state.doc.length, (from) => {
    out.push(view.state.doc.lineAt(from).number);
  });
  return [...new Set(out)];
}

export const setDebugLineEffect = StateEffect.define<number | null>();

const debugLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    v = v.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setDebugLineEffect)) {
        if (e.value == null || e.value < 1 || e.value > tr.state.doc.lines) v = Decoration.none;
        else v = Decoration.set([Decoration.line({ class: "cm-debug-line" }).range(tr.state.doc.line(e.value).from)]);
      }
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Ekstensi debugger untuk satu berkas. */
export function debugExtension(path: string): Extension {
  const bpField = StateField.define<RangeSet<GutterMarker>>({
    create: (state) => fromList(state.doc, dbg().breakpoints[path] ?? []),
    update(set, tr) {
      set = set.map(tr.changes);
      for (const e of tr.effects) if (e.is(setBpsEffect)) set = fromList(tr.state.doc, e.value);
      return set;
    },
  });
  let syncTimer = 0;
  return [
    bpField,
    debugLineField,
    gutter({
      class: "cm-bp-gutter",
      markers: (v) => v.state.field(bpField),
      initialSpacer: () => new BpMarker(true, false),
      domEventHandlers: {
        mousedown(view, line) {
          const n = view.state.doc.lineAt(line.from).number;
          void import("./debug").then((m) => m.toggleBreakpoint(path, n));
          return true;
        },
      },
    }),
    // Baris bergeser karena editan: simpan baris baru ke store.
    EditorView.updateListener.of((u) => {
      if (!u.docChanged || !(dbg().breakpoints[path]?.length ?? 0)) return;
      clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        const lines = linesOf(u.view, u.view.state.field(bpField));
        const prev = dbg().breakpoints[path] ?? [];
        const next = lines.map((l, i) => ({ ...(prev[i] ?? {}), line: l }));
        setDbg((s) => ({ breakpoints: { ...s.breakpoints, [path]: next } }));
      }, 400);
    }),
    hoverTooltip(async (view, pos) => {
      if (dbg().status !== "paused") return null;
      const word = view.state.wordAt(pos);
      if (!word) return null;
      // Sertakan akses properti di kiri (obj.prop).
      let from = word.from;
      const text = view.state.doc.sliceString(Math.max(0, from - 80), word.to);
      const m = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/.exec(text);
      if (m) from = word.to - m[1].length;
      const expr = view.state.doc.sliceString(from, word.to);
      const { evaluateHover } = await import("./debug");
      const r = await evaluateHover(expr);
      if (r == null) return null;
      return {
        pos: from,
        end: word.to,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "cm-debug-hover";
          const k = document.createElement("span");
          k.className = "cm-debug-hover-k";
          k.textContent = `${expr} = `;
          const v = document.createElement("span");
          v.textContent = r.length > 400 ? `${r.slice(0, 400)}…` : r;
          dom.append(k, v);
          return { dom };
        },
      };
    }),
  ];
}
