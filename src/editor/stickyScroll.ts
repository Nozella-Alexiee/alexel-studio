// Sticky scroll (seperti VS Code): baris pembuka blok yang sedang digulir (fungsi, kelas, if…)
// tetap terlihat di atas editor. Blok ditentukan dari indentasi, jadi berlaku di semua bahasa.
// Klik baris → lompat ke sana.

import type { Extension, Text } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { indentColumns } from "./indentGuides";

const MAX = 4;

/** Nomor baris (1-based) pembuka blok yang memuat baris `top`, dari luar ke dalam. */
export function stickyLines(doc: Pick<Text, "line" | "lines">, top: number, tabSize: number, scanLimit = 2000): number[] {
  if (top < 1 || top > doc.lines) return [];
  let level = Infinity;
  // Mulai dari baris berisi pertama di/ setelah `top`.
  for (let n = top; n <= Math.min(doc.lines, top + 50); n++) {
    const c = indentColumns(doc.line(n).text, tabSize);
    if (c !== null) {
      level = c;
      break;
    }
  }
  const out: number[] = [];
  for (let n = top - 1; n >= Math.max(1, top - scanLimit) && level > 0; n--) {
    const text = doc.line(n).text;
    const c = indentColumns(text, tabSize);
    if (c === null || c >= level) continue;
    // Baris penutup (mis. "}" atau "end") bukan pembuka blok.
    if (/^\s*[)\]}]/.test(text)) continue;
    out.unshift(n);
    level = c;
  }
  return out.slice(-MAX);
}

const sticky = ViewPlugin.fromClass(
  class {
    dom: HTMLDivElement;
    key = "";
    constructor(readonly view: EditorView) {
      this.dom = document.createElement("div");
      this.dom.className = "cm-sticky";
      this.dom.setAttribute("aria-hidden", "true");
      view.dom.appendChild(this.dom);
      this.onScroll = this.onScroll.bind(this);
      view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      this.dom.style.display = "none";
      this.schedule();
    }
    onScroll() {
      this.schedule();
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.geometryChanged || u.viewportChanged) this.schedule();
    }
    /** Baca tata letak di fase ukur CodeMirror (tidak boleh di dalam update), lalu tulis DOM. */
    schedule() {
      this.view.requestMeasure({
        key: this,
        read: (v) => {
          const rect = v.scrollDOM.getBoundingClientRect();
          // documentTop sudah memperhitungkan posisi gulir: tinggi dokumen di tepi atas area terlihat.
          const block = v.lineBlockAtHeight(rect.top - v.documentTop + 1);
          const topLine = v.state.doc.lineAt(block.from).number;
          const lines = stickyLines(v.state.doc, topLine, v.state.tabSize).filter((n) => n < topLine);
          const gutter = v.dom.querySelector<HTMLElement>(".cm-gutters");
          return { lines, left: gutter?.offsetWidth ?? 0 };
        },
        write: (m) => this.render(m.lines, m.left),
      });
    }
    render(lines: number[], left: number) {
      const v = this.view;
      const key = `${lines.join(",")}@${left}`;
      if (key === this.key) return;
      this.key = key;
      this.dom.replaceChildren();
      this.dom.style.display = lines.length ? "" : "none";
      this.dom.style.left = `${left}px`;
      for (const n of lines) {
        const row = document.createElement("div");
        row.className = "cm-sticky-line";
        row.textContent = v.state.doc.line(n).text.replace(/\t/g, " ".repeat(v.state.tabSize));
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const pos = v.state.doc.line(n).from;
          v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: lines.length * 20 }) });
          v.focus();
        });
        this.dom.appendChild(row);
      }
    }
    destroy() {
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
      this.dom.remove();
    }
  }
);

export const stickyScroll: Extension = [
  sticky,
  EditorView.theme({
    ".cm-sticky": {
      position: "absolute",
      top: 0,
      right: 0,
      zIndex: 5,
      background: "var(--ed-bg, var(--surface-1))",
      borderBottom: "1px solid var(--border)",
      boxShadow: "0 2px 6px rgba(0,0,0,.18)",
      fontFamily: "var(--font-mono)",
      pointerEvents: "auto",
    },
    ".cm-sticky-line": { padding: "0 2px 0 6px", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", lineHeight: "inherit", color: "var(--fg)" },
    ".cm-sticky-line:hover": { background: "var(--surface-hover)" },
  }),
];
