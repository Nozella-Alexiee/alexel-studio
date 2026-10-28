// Blame baris aktif (seperti GitLens dasar): penulis, waktu, dan ringkasan commit di akhir baris kursor.
// Data diambil dari `git blame` berkas di disk; selama ada editan yang belum disimpan, anotasi
// disembunyikan (nomor baris bisa sudah bergeser) sampai berkas disimpan lagi.

import { Facet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { api } from "../lib/ipc";
import { timeAgo } from "../lib/format";
import type { BlameInfo } from "../lib/types";
import { getState, useStore } from "../state/store";
import { tl } from "../i18n";

const blamePath = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });
const setBlame = StateEffect.define<BlameInfo | null>();
const ZERO = /^0+$/;

/** Blame terakhir + apakah dokumen sudah diedit sejak itu. */
const blameField = StateField.define<{ info: BlameInfo | null; stale: boolean }>({
  create: () => ({ info: null, stale: false }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setBlame)) return { info: e.value, stale: false };
    return tr.docChanged ? { ...v, stale: true } : v;
  },
});

class BlameWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: BlameWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-blame";
    s.textContent = this.text;
    s.setAttribute("aria-hidden", "true");
    return s;
  }
}

/** Teks anotasi untuk baris `line` (1-based), atau null. */
export function blameText(info: BlameInfo | null, line: number): string | null {
  const sha = info?.lines[line - 1];
  if (!sha) return null;
  if (ZERO.test(sha)) return tl("Belum di-commit");
  const c = info!.commits[sha];
  if (!c) return null;
  return `${c.author}, ${timeAgo(c.time_s * 1000)} · ${c.summary}`;
}

const enabled = () => getState().settings.gitBlame;

const blamePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    constructor(readonly view: EditorView) {
      if (enabled()) void loadBlame(view);
      this.decorations = this.build();
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.transactions.some((t) => t.effects.some((e) => e.is(setBlame)))) this.decorations = this.build();
    }
    build(): DecorationSet {
      const { info, stale } = this.view.state.field(blameField);
      if (!enabled() || stale || !info) return Decoration.none;
      const sel = this.view.state.selection.main;
      const line = this.view.state.doc.lineAt(sel.head);
      const text = blameText(info, line.number);
      if (!text) return Decoration.none;
      return Decoration.set([Decoration.widget({ widget: new BlameWidget(text), side: 1 }).range(line.to)]);
    }
  },
  { decorations: (p) => p.decorations }
);

async function loadBlame(view: EditorView) {
  const path = view.state.facet(blamePath);
  if (!path || !getState().git?.is_repo) return;
  const info = await api.gitBlame(path).catch(() => null);
  if (view.state.facet(blamePath) === path) view.dispatch({ effects: setBlame.of(info) });
}

/** Muat ulang blame di view (setelah simpan/commit atau saat fitur dinyalakan). */
export function refreshBlame(view: EditorView) {
  if (enabled()) void loadBlame(view);
  else view.dispatch({ effects: setBlame.of(null) });
}

export function blameExtension(path: string): Extension {
  return [blamePath.of(path), blameField, blamePlugin];
}

// Fitur dinyalakan/dimatikan dari Pengaturan atau palette: segarkan semua editor yang terbuka.
let last = getState().settings.gitBlame;
useStore.subscribe((st) => {
  if (st.settings.gitBlame === last) return;
  last = st.settings.gitBlame;
  void import("./documents").then((d) => {
    for (const g of [0, 1]) {
      const v = d.viewOf(g);
      if (v) refreshBlame(v);
    }
  });
});
