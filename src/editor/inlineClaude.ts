// Claude inline (⌘K di editor): seleksi kode → tulis permintaan → Claude menulis pengganti →
// setiap blok perubahan tampil merah/hijau dan bisa diterima atau ditolak satu per satu.
// Dokumen tidak diubah sampai pengguna menekan Terima.

import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CrabMascot, flashKepi } from "../components/CrabMascot";
import { api, errMsg } from "../lib/ipc";
import { lineHunks } from "../lib/diff";
import { relative } from "../lib/paths";
import { confirmDialog, getState, setState, toast } from "../state/store";

interface InlineHunk {
  id: number;
  /** Posisi dokumen: awal baris pertama yang diganti (atau titik sisip). */
  from: number;
  /** Akhir baris terakhir yang diganti (== from untuk sisipan murni). */
  to: number;
  oldCount: number;
  newLines: string[];
}

interface InlineState {
  phase: "prompt" | "busy" | "diff";
  /** Awal & akhir wilayah yang diseleksi (baris penuh). */
  from: number;
  to: number;
  prompt: string;
  hunks: InlineHunk[];
  accepted: number;
  runId: string | null;
}

const setInline = StateEffect.define<InlineState | null>();
const dropHunk = StateEffect.define<number>();

let seq = 0;

export const inlineField = StateField.define<InlineState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setInline)) value = e.value;
    if (value && tr.docChanged) {
      const m = tr.changes;
      value = {
        ...value,
        from: m.mapPos(value.from, -1),
        to: m.mapPos(value.to, 1),
        hunks: value.hunks.map((h) => ({ ...h, from: m.mapPos(h.from, -1), to: m.mapPos(h.to, 1) })),
      };
    }
    for (const e of tr.effects) {
      if (e.is(dropHunk) && value) value = { ...value, hunks: value.hunks.filter((h) => h.id !== e.value) };
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => (v ? buildDecorations(v) : Decoration.none)),
});

// ---------- Widget ----------

class PanelWidget extends WidgetType {
  constructor(readonly st: InlineState) {
    super();
  }
  eq(o: PanelWidget) {
    return o.st.phase === this.st.phase && o.st.hunks.length === this.st.hunks.length;
  }
  root: Root | null = null;
  toDOM(view: EditorView) {
    // Pembungkus memakai padding, bukan margin: CodeMirror tidak mengukur margin widget blok,
    // sehingga nomor baris akan bergeser.
    const wrap = document.createElement("div");
    wrap.className = "cm-ai-wrap";
    const box = document.createElement("div");
    box.className = `cm-ai-panel is-${this.st.phase}`;
    wrap.appendChild(box);
    const kepi = document.createElement("span");
    kepi.className = "cm-ai-kepi";
    this.root = createRoot(kepi);
    this.root.render(createElement(CrabMascot, { mood: this.st.phase === "busy" ? "mikir" : "siap", size: 22 }));
    box.appendChild(kepi);
    if (this.st.phase === "prompt") {
      const input = document.createElement("input");
      input.className = "cm-ai-input";
      input.placeholder = "Mau diubah jadi apa? (Enter kirim · Esc batal)";
      input.setAttribute("aria-label", "Perintah untuk Claude");
      input.value = this.st.prompt;
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && input.value.trim()) void runInline(view, input.value.trim());
        if (e.key === "Escape") cancelInline(view);
      });
      box.appendChild(input);
      box.appendChild(button("Kirim", "cm-ai-btn is-primary", () => input.value.trim() && void runInline(view, input.value.trim())));
      box.appendChild(button("Batal", "cm-ai-btn", () => cancelInline(view)));
      requestAnimationFrame(() => input.focus());
    } else if (this.st.phase === "busy") {
      const t = document.createElement("span");
      t.className = "cm-ai-note";
      t.textContent = `Claude lagi menulis perubahan untuk: “${this.st.prompt}”`;
      box.appendChild(t);
      box.appendChild(button("Batal", "cm-ai-btn", () => cancelInline(view)));
    } else {
      const t = document.createElement("span");
      t.className = "cm-ai-note";
      t.textContent = `${this.st.hunks.length} perubahan menunggu`;
      box.appendChild(t);
      box.appendChild(button("Terima semua", "cm-ai-btn is-primary", () => acceptAll(view), "⌘↵"));
      box.appendChild(button("Tolak semua", "cm-ai-btn", () => cancelInline(view), "Esc"));
    }
    return wrap;
  }
  destroy() {
    const r = this.root;
    this.root = null;
    if (r) queueMicrotask(() => r.unmount());
  }
  ignoreEvent() {
    return true;
  }
}

class AddedWidget extends WidgetType {
  constructor(readonly hunk: InlineHunk, readonly index: number, readonly total: number) {
    super();
  }
  eq(o: AddedWidget) {
    return o.hunk.id === this.hunk.id && o.index === this.index && o.total === this.total;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("div");
    box.className = "cm-ai-hunk";
    for (const line of this.hunk.newLines) {
      const el = document.createElement("div");
      el.className = "cm-ai-add";
      el.textContent = line || " ";
      box.appendChild(el);
    }
    const bar = document.createElement("div");
    bar.className = "cm-ai-bar";
    const label = document.createElement("span");
    label.textContent = `Perubahan ${this.index + 1} dari ${this.total}`;
    bar.appendChild(label);
    bar.appendChild(button("Terima", "cm-ai-chip is-ok", () => acceptHunk(view, this.hunk.id)));
    bar.appendChild(button("Tolak", "cm-ai-chip is-no", () => rejectHunk(view, this.hunk.id)));
    box.appendChild(bar);
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

function button(text: string, cls: string, run: () => void, kbd?: string) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = text;
  if (kbd) b.title = kbd;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", run);
  return b;
}

function buildDecorations(st: InlineState): DecorationSet {
  const ranges = [];
  ranges.push(Decoration.widget({ widget: new PanelWidget(st), block: true, side: -1 }).range(st.from));
  if (st.phase !== "diff") {
    // Tandai wilayah yang akan diubah.
    ranges.push(Decoration.mark({ class: "cm-ai-region" }).range(st.from, Math.max(st.from, st.to)));
  }
  st.hunks.forEach((h, i) => {
    if (h.oldCount > 0) ranges.push(Decoration.mark({ class: "cm-ai-del" }).range(h.from, h.to));
    ranges.push(Decoration.widget({ widget: new AddedWidget(h, i, st.hunks.length), block: true, side: 1 }).range(h.oldCount > 0 ? h.to : h.from));
  });
  return Decoration.set(ranges, true);
}

// ---------- Aksi ----------

const get = (view: EditorView) => view.state.field(inlineField, false) ?? null;

/** Buka kotak prompt untuk seleksi (atau baris kursor) di view ini. */
export function openInline(view: EditorView) {
  if (get(view)) return;
  const sel = view.state.selection.main;
  const from = view.state.doc.lineAt(sel.from).from;
  const to = view.state.doc.lineAt(sel.empty ? sel.from : sel.to - (sel.to > sel.from && view.state.doc.lineAt(sel.to).from === sel.to ? 1 : 0)).to;
  view.dispatch({ effects: setInline.of({ phase: "prompt", from, to, prompt: "", hunks: [], accepted: 0, runId: null }) });
}

function cancelInline(view: EditorView) {
  const st = get(view);
  if (st?.runId) void api.claudeCancel(st.runId).catch(() => {});
  setState({ inlineClaudeBusy: false });
  view.dispatch({ effects: setInline.of(null) });
  view.focus();
}

function stripFences(text: string): string {
  const m = /```[\w+#.-]*\n([\s\S]*?)\n?```/.exec(text);
  return (m ? m[1] : text).replace(/\s+$/, "");
}

async function runInline(view: EditorView, prompt: string) {
  const st = get(view);
  if (!st) return;
  const s = getState();
  const tab = s.tabs[s.groups[s.focusedGroup]?.active ?? ""];
  const path = tab?.id ?? "";
  const rel = s.root ? relative(s.root, path) : path;
  const original = view.state.sliceDoc(st.from, st.to);
  const startLine = view.state.doc.lineAt(st.from).number;
  const endLine = view.state.doc.lineAt(st.to).number;
  if (s.settings.claudeConfirm && !(await confirmDialog("Kirim ke Claude?", `Baris ${startLine}–${endLine} dari ${rel || "berkas ini"} (plus isi berkas sebagai konteks) dan permintaanmu akan dikirim ke Claude Code. Claude tidak mengubah berkas apa pun; kamu yang memilih perubahan.`, "Kirim"))) return;
  const full = view.state.doc.toString();
  const context = full.length > 40_000 ? full.slice(0, 40_000) + "\n…(dipotong)" : full;
  const payload = [
    `Kamu membantu mengedit berkas ${rel || "(tanpa nama)"}. Ganti HANYA bagian yang ditandai sesuai permintaan.`,
    "Balas dengan kode pengganti untuk bagian itu saja: tanpa penjelasan, tanpa ``` dan tanpa baris di luar bagian itu. Pertahankan gaya indentasi.",
    `### Isi berkas (konteks)\n${context}`,
    `### Bagian yang diganti (baris ${startLine}–${endLine})\n${original}`,
    `### Permintaan\n${prompt}`,
  ].join("\n\n");
  const runId = `inline-${Date.now()}-${++seq}`;
  view.dispatch({ effects: setInline.of({ ...st, phase: "busy", prompt, runId }) });
  setState({ inlineClaudeBusy: true });
  try {
    const result = stripFences(await api.claudeInline(runId, s.root ?? "", payload, s.settings.claudeInlineModel));
    const cur = get(view);
    if (!cur || cur.runId !== runId) return; // dibatalkan
    const hunks: InlineHunk[] = lineHunks(original, result).map((h) => {
      const first = view.state.doc.line(Math.min(startLine + h.oldStart, view.state.doc.lines));
      if (h.oldCount === 0) {
        // Sisipan murni: sebelum baris oldStart (atau setelah baris terakhir wilayah).
        const at = startLine + h.oldStart <= endLine ? first.from : view.state.doc.line(endLine).to;
        return { id: ++seq, from: at, to: at, oldCount: 0, newLines: h.newLines };
      }
      const last = view.state.doc.line(startLine + h.oldStart + h.oldCount - 1);
      return { id: ++seq, from: first.from, to: last.to, oldCount: h.oldCount, newLines: h.newLines };
    });
    if (!hunks.length) {
      toast("Claude tidak menyarankan perubahan untuk bagian ini.");
      view.dispatch({ effects: setInline.of(null) });
    } else {
      view.dispatch({ effects: setInline.of({ ...cur, phase: "diff", hunks, runId: null }) });
      flashKepi("sukses", 2200);
    }
  } catch (e) {
    if (get(view)?.runId === runId) {
      toast(`Claude: ${errMsg(e)}`, "error");
      flashKepi("error", 4000);
      view.dispatch({ effects: setInline.of(null) });
    }
  } finally {
    setState({ inlineClaudeBusy: false });
  }
}

function applyHunk(view: EditorView, h: InlineHunk) {
  const doc = view.state.doc;
  const text = h.newLines.join("\n");
  if (h.oldCount === 0) {
    const line = doc.lineAt(h.from);
    // Sisip sebelum baris di posisi itu, atau sesudah baris terakhir bila titiknya di akhir baris.
    if (h.from === line.from) view.dispatch({ changes: { from: h.from, insert: text + "\n" }, effects: dropHunk.of(h.id), userEvent: "input.ai" });
    else view.dispatch({ changes: { from: h.from, insert: "\n" + text }, effects: dropHunk.of(h.id), userEvent: "input.ai" });
  } else if (!h.newLines.length) {
    // Hapus murni: ikut hapus jeda baris.
    const to = Math.min(h.to + 1, doc.length);
    const from = to === h.to && h.from > 0 ? h.from - 1 : h.from;
    view.dispatch({ changes: { from, to }, effects: dropHunk.of(h.id), userEvent: "delete.ai" });
  } else {
    view.dispatch({ changes: { from: h.from, to: h.to, insert: text }, effects: dropHunk.of(h.id), userEvent: "input.ai" });
  }
}

function finish(view: EditorView, total: number) {
  view.dispatch({ effects: setInline.of(null) });
  view.focus();
  if (total) {
    flashKepi("sukses", 3000);
    void import("../components/PenguinMascot").then((m) => m.flashPenguin("jempol", 2600));
    toast(`${total} perubahan dari Claude diterapkan. ⌘Z untuk membatalkan.`, "success");
  }
}

/** Setelah satu blok diputuskan: tutup bila semua sudah diputuskan. */
function afterDecision(view: EditorView, accepted: boolean) {
  const st = get(view);
  if (!st) return;
  const total = st.accepted + (accepted ? 1 : 0);
  if (st.hunks.length) view.dispatch({ effects: setInline.of({ ...st, accepted: total }) });
  else finish(view, total);
}

function acceptHunk(view: EditorView, id: number) {
  const h = get(view)?.hunks.find((x) => x.id === id);
  if (!h) return;
  applyHunk(view, h);
  afterDecision(view, true);
}

function rejectHunk(view: EditorView, id: number) {
  view.dispatch({ effects: dropHunk.of(id) });
  afterDecision(view, false);
}

function acceptAll(view: EditorView) {
  const st = get(view);
  if (!st) return;
  // Dari bawah ke atas supaya posisi blok di atasnya tidak bergeser; posisi dipetakan ulang tiap langkah.
  const ids = [...st.hunks].sort((a, b) => b.from - a.from).map((h) => h.id);
  for (const id of ids) {
    const h = get(view)?.hunks.find((x) => x.id === id);
    if (h) applyHunk(view, h);
  }
  finish(view, st.accepted + ids.length);
}

export function inlineActive(state: EditorState): boolean {
  return !!state.field(inlineField, false);
}

/** Ekstensi editor: field + tombol ⌘↵ (terima semua) dan Esc (batal/tolak semua). */
export function inlineClaude(): Extension {
  return [
    inlineField,
    Prec.highest(
      keymap.of([
        { key: "Mod-Enter", run: (v) => (get(v)?.phase === "diff" ? (acceptAll(v), true) : false) },
        { key: "Escape", run: (v) => (get(v) ? (cancelInline(v), true) : false) },
      ])
    ),
  ];
}
