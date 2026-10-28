// Fitur editor dari provider ekstensi yang tampil di dalam teks: CodeLens, inlay hints, sorotan
// kemunculan (document highlight), tautan (Cmd/Ctrl+klik), lipatan, kotak warna, dan saran sebaris
// (ghost text, Tab untuk menerima). Semuanya hanya bekerja bila ada provider untuk berkas ini.

import { foldService } from "@codemirror/language";
import { Prec, StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { fileUri, uriToPath } from "../editor/lsp";
import { openExternal } from "../lib/ipc";
import { modKey } from "../lib/keys";
import { hostCall } from "./client";
import { hostProviders } from "./features";

interface JPos { l: number; c: number }
interface JRange { s: JPos; e: JPos }
interface Lens { range: JRange; title: string; command: string; arguments?: unknown[] }
interface Hint { pos: JPos; label: string; left: boolean; right: boolean }
interface Link { range: JRange; target: string }
interface HostColor { range: JRange; r: number; g: number; b: number; a: number }
interface Ghost { pos: number; text: string; command?: { command: string; arguments?: unknown[] } }

const offsetOf = (state: EditorState, p: JPos) => {
  const line = state.doc.line(Math.min(Math.max(p.l + 1, 1), state.doc.lines));
  return Math.min(line.from + p.c, line.to);
};
const posOf = (state: EditorState, offset: number): JPos => {
  const line = state.doc.lineAt(offset);
  return { l: line.number - 1, c: offset - line.from };
};

// ---- state -------------------------------------------------------------------------------

interface Extras {
  lenses: Lens[];
  hints: Hint[];
  links: Link[];
  colors: HostColor[];
  folds: { start: number; end: number }[];
}
const setExtras = StateEffect.define<Partial<Extras>>();
const setHighlights = StateEffect.define<JRange[]>();
const setGhost = StateEffect.define<Ghost | null>();

const extrasField = StateField.define<Extras>({
  create: () => ({ lenses: [], hints: [], links: [], colors: [], folds: [] }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setExtras)) v = { ...v, ...e.value };
    return v;
  },
});

class LensWidget extends WidgetType {
  constructor(readonly lenses: Lens[], readonly indent: string) {
    super();
  }
  eq(o: LensWidget) {
    return o.indent === this.indent && o.lenses.map((l) => l.title).join("|") === this.lenses.map((l) => l.title).join("|");
  }
  toDOM() {
    const d = document.createElement("div");
    d.className = "cm-codelens";
    d.style.paddingLeft = `calc(6px + ${this.indent.length}ch)`;
    this.lenses.forEach((l, i) => {
      if (i) d.append(document.createTextNode(" | "));
      const a = document.createElement("span");
      a.className = "cm-codelens-item";
      // Ikon "$(nama)" codicon tidak tersedia: dibuang dari judul.
      a.textContent = l.title.replace(/\$\([\w-]+\)\s*/g, "");
      a.onmousedown = (e) => {
        e.preventDefault();
        if (l.command) void hostCall("command/execute", { id: l.command, args: l.arguments ?? [] }).catch(() => {});
      };
      d.append(a);
    });
    return d;
  }
  ignoreEvent() {
    return true;
  }
}

class HintWidget extends WidgetType {
  constructor(readonly h: Hint) {
    super();
  }
  eq(o: HintWidget) {
    return o.h.label === this.h.label && o.h.left === this.h.left && o.h.right === this.h.right;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-inlay-hint";
    s.textContent = `${this.h.left ? " " : ""}${this.h.label}${this.h.right ? " " : ""}`;
    return s;
  }
}

class ColorWidget extends WidgetType {
  constructor(readonly css: string) {
    super();
  }
  eq(o: ColorWidget) {
    return o.css === this.css;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-color-swatch cm-color-swatch-host";
    s.style.setProperty("--swatch", this.css);
    return s;
  }
}

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: GhostWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-ghost-text";
    s.textContent = this.text;
    return s;
  }
}

/** Literal warna yang sudah diberi kotak oleh colorPicker bawaan (jangan digandakan). */
const LITERAL = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\()/i;

function extrasDecorations(state: EditorState): DecorationSet {
  const v = state.field(extrasField);
  const out: Range<Decoration>[] = [];
  const byLine = new Map<number, Lens[]>();
  for (const l of v.lenses) {
    const line = Math.min(Math.max(l.range.s.l + 1, 1), state.doc.lines);
    byLine.set(line, [...(byLine.get(line) ?? []), l]);
  }
  for (const [n, lenses] of byLine) {
    const line = state.doc.line(n);
    out.push(Decoration.widget({ widget: new LensWidget(lenses, /^\s*/.exec(line.text)![0]), block: true, side: -1 }).range(line.from));
  }
  for (const h of v.hints) out.push(Decoration.widget({ widget: new HintWidget(h), side: 1 }).range(offsetOf(state, h.pos)));
  for (const c of v.colors) {
    const from = offsetOf(state, c.range.s);
    if (LITERAL.test(state.doc.sliceString(from, from + 5))) continue;
    out.push(Decoration.widget({ widget: new ColorWidget(`rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`), side: -1 }).range(from));
  }
  return Decoration.set(out, true);
}

const extrasDeco = StateField.define<DecorationSet>({
  create: (s) => extrasDecorations(s),
  update(d, tr) {
    if (tr.effects.some((e) => e.is(setExtras))) return extrasDecorations(tr.state);
    return tr.docChanged ? d.map(tr.changes) : d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const highlightMark = Decoration.mark({ class: "cm-host-highlight" });
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects)
      if (e.is(setHighlights)) {
        const ranges = e.value.map((r) => ({ from: offsetOf(tr.state, r.s), to: offsetOf(tr.state, r.e) })).filter((r) => r.to > r.from);
        return Decoration.set(ranges.map((r) => highlightMark.range(r.from, r.to)), true);
      }
    return tr.docChanged ? Decoration.none : d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(g, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    // Ketikan yang cocok dengan awal saran: saran tetap, sisanya dipendekkan.
    if (g && tr.docChanged) {
      let next: Ghost | null = null;
      tr.changes.iterChanges((fromA, toA, _fb, _tb, ins) => {
        const t = ins.toString();
        if (fromA === g.pos && toA === fromA && t && g.text.startsWith(t) && g.text.length > t.length) next = { ...g, pos: g.pos + t.length, text: g.text.slice(t.length) };
      });
      return next;
    }
    if (g && tr.selection && tr.state.selection.main.head !== g.pos) return null;
    return g;
  },
  provide: (f) => EditorView.decorations.from(f, (g) => (g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)]) : Decoration.none)),
});

// ---- pengambilan dari host ---------------------------------------------------------------

function fetcher(path: string) {
  return ViewPlugin.fromClass(
    class {
      timer = 0;
      hlTimer = 0;
      ghostTimer = 0;
      seq = 0;
      constructor(readonly view: EditorView) {
        this.schedule(400);
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.schedule(700);
        if (u.selectionSet || u.docChanged) this.scheduleHighlight();
        if (u.docChanged && u.transactions.some((t) => t.isUserEvent("input.type"))) this.scheduleGhost();
      }
      schedule(ms: number) {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => void this.fetchAll(), ms);
      }
      scheduleHighlight() {
        clearTimeout(this.hlTimer);
        this.hlTimer = window.setTimeout(() => void this.fetchHighlight(), 250);
      }
      scheduleGhost() {
        clearTimeout(this.ghostTimer);
        this.ghostTimer = window.setTimeout(() => void this.fetchGhost(), 350);
      }
      async fetchAll() {
        const view = this.view;
        const doc = view.state.doc;
        const uri = fileUri(path);
        const want = (k: string) => hostProviders(k, path).length > 0;
        const ask = <T,>(kind: string, extra: Record<string, unknown> = {}) => (want(kind) ? hostCall<T>("provide", { kind, uri, ...extra }).catch(() => null) : Promise.resolve(null));
        const [lenses, hints, links, colors, folds] = await Promise.all([
          ask<Lens[]>("codeLens"),
          ask<Hint[]>("inlayHints", { range: { s: { l: 0, c: 0 }, e: posOf(view.state, doc.length) } }),
          ask<Link[]>("documentLink"),
          ask<HostColor[]>("color"),
          ask<{ start: number; end: number }[]>("foldingRange"),
        ]);
        const cur = view.state.field(extrasField);
        const none = [lenses, hints, links, colors, folds].every((x) => !x?.length);
        if (none && !cur.lenses.length && !cur.hints.length && !cur.links.length && !cur.colors.length && !cur.folds.length) return;
        // Dokumen berubah selama menunggu: posisi sudah basi, ambil ulang nanti.
        if (view.state.doc !== doc) return this.schedule(500);
        view.dispatch({ effects: setExtras.of({ lenses: (lenses ?? []).slice(0, 300), hints: (hints ?? []).slice(0, 2000), links: links ?? [], colors: colors ?? [], folds: folds ?? [] }) });
      }
      async fetchHighlight() {
        if (!hostProviders("documentHighlight", path).length) return;
        const view = this.view;
        const doc = view.state.doc;
        const sel = view.state.selection.main;
        if (!sel.empty) return view.dispatch({ effects: setHighlights.of([]) });
        const r = await hostCall<{ range: JRange }[]>("provide", { kind: "documentHighlight", uri: fileUri(path), pos: posOf(view.state, sel.head) }).catch(() => null);
        if (view.state.doc !== doc || view.state.selection.main.head !== sel.head) return;
        view.dispatch({ effects: setHighlights.of((r ?? []).length > 1 ? r!.map((x) => x.range) : []) });
      }
      async fetchGhost() {
        if (!hostProviders("inlineCompletion", path).length) return;
        const view = this.view;
        const doc = view.state.doc;
        const head = view.state.selection.main.head;
        if (!view.state.selection.main.empty) return;
        const r = await hostCall<{ text: string; range: JRange | null; command?: Ghost["command"] } | null>("provide", { kind: "inlineCompletion", uri: fileUri(path), pos: posOf(view.state, head) }).catch(() => null);
        if (!r || view.state.doc !== doc || view.state.selection.main.head !== head) return;
        // Bagian saran yang sudah diketik (rentang dari awal kata sampai kursor) dilewati.
        const from = r.range ? offsetOf(view.state, r.range.s) : head;
        const typed = view.state.doc.sliceString(from, head);
        const text = typed && r.text.startsWith(typed) ? r.text.slice(typed.length) : from === head ? r.text : "";
        if (text) view.dispatch({ effects: setGhost.of({ pos: head, text, command: r.command }) });
      }
      destroy() {
        clearTimeout(this.timer);
        clearTimeout(this.hlTimer);
        clearTimeout(this.ghostTimer);
      }
    }
  );
}

function acceptGhost(view: EditorView): boolean {
  const g = view.state.field(ghostField, false);
  if (!g) return false;
  view.dispatch({ changes: { from: g.pos, insert: g.text }, selection: { anchor: g.pos + g.text.length }, effects: setGhost.of(null), userEvent: "input.complete" });
  if (g.command) void hostCall("command/execute", { id: g.command.command, args: g.command.arguments ?? [] }).catch(() => {});
  return true;
}

function dismissGhost(view: EditorView): boolean {
  if (!view.state.field(ghostField, false)) return false;
  view.dispatch({ effects: setGhost.of(null) });
  return true;
}

/** Cmd/Ctrl+klik pada tautan dari provider: buka URL di browser atau berkas di editor. */
const linkClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!modKey(e) || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return false;
    const link = view.state.field(extrasField).links.find((l) => offsetOf(view.state, l.range.s) <= pos && pos <= offsetOf(view.state, l.range.e));
    if (!link) return false;
    e.preventDefault();
    if (/^https?:/i.test(link.target)) void openExternal(link.target);
    else if (link.target.startsWith("file:")) {
      const m = /#L?(\d+)(?:,(\d+))?$/.exec(link.target);
      void import("../app/actions").then((A) => A.openFile(uriToPath(link.target.replace(/#.*$/, "")), m ? { line: Number(m[1]), col: m[2] ? Number(m[2]) : 1 } : {}));
    } else if (link.target.startsWith("command:")) {
      const [id, q] = link.target.slice(8).split("?");
      let args: unknown[] = [];
      try {
        args = q ? [].concat(JSON.parse(decodeURIComponent(q))) : [];
      } catch {
        /* argumen rusak: jalankan tanpa argumen */
      }
      void hostCall("command/execute", { id, args }).catch(() => {});
    }
    return true;
  },
});

/** Lipatan dari provider (dipakai bila ada; bila tidak, lipatan bawaan bahasa yang berlaku). */
const hostFolds = foldService.of((state, from) => {
  const folds = state.field(extrasField, false)?.folds;
  if (!folds?.length) return null;
  const line = state.doc.lineAt(from).number - 1;
  const f = folds.find((x) => x.start === line && x.end > x.start);
  if (!f) return null;
  const end = Math.min(f.end + 1, state.doc.lines);
  return { from: state.doc.line(line + 1).to, to: state.doc.line(end).to };
});

export function hostEditorExtras(path: string): Extension {
  return [
    extrasField,
    extrasDeco,
    highlightField,
    ghostField,
    fetcher(path),
    linkClick,
    hostFolds,
    Prec.highest(keymap.of([{ key: "Tab", run: acceptGhost }, { key: "Escape", run: dismissGhost }])),
    EditorView.theme({
      ".cm-codelens": { fontSize: "0.85em", color: "var(--fg-subtle)", lineHeight: "1.5", userSelect: "none" },
      ".cm-codelens-item": { cursor: "pointer" },
      ".cm-codelens-item:hover": { color: "var(--accent)", textDecoration: "underline" },
      ".cm-inlay-hint": { fontSize: "0.88em", color: "var(--fg-subtle)", background: "color-mix(in srgb, var(--fg-subtle) 12%, transparent)", borderRadius: "3px", padding: "0 3px", margin: "0 1px" },
      ".cm-host-highlight": { background: "color-mix(in srgb, var(--accent) 18%, transparent)", borderRadius: "2px" },
      ".cm-ghost-text": { color: "var(--fg-subtle)", opacity: "0.75", fontStyle: "italic", whiteSpace: "pre" },
    }),
  ];
}
