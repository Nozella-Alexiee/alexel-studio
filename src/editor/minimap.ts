// Minimap kanvas: seluruh dokumen diperkecil, area terlihat, plus penanda error
// dan perubahan git. Digambar ulang dengan throttle supaya ringan.

import { forEachDiagnostic } from "@codemirror/lint";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { gitField } from "./gitGutter";

const WIDTH = 72;

function cssVar(el: HTMLElement, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

const plugin = ViewPlugin.fromClass(
  class {
    canvas: HTMLCanvasElement;
    raf = 0;
    timer = 0;
    dragging = false;
    ro: ResizeObserver;

    constructor(readonly view: EditorView) {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "cm-nozel-minimap";
      this.canvas.setAttribute("aria-hidden", "true");
      view.dom.appendChild(this.canvas);
      this.canvas.addEventListener("pointerdown", this.onDown);
      this.ro = new ResizeObserver(() => this.schedule());
      this.ro.observe(view.dom);
      view.scrollDOM.addEventListener("scroll", this.schedule, { passive: true });
      this.schedule();
    }

    update(u: ViewUpdate) {
      if (u.docChanged) {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.schedule(), 140);
      } else if (u.viewportChanged || u.geometryChanged || u.transactions.some((t) => t.effects.length)) {
        this.schedule();
      }
    }

    schedule = () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.draw();
      });
    };

    metrics() {
      const h = this.view.dom.clientHeight;
      const lines = this.view.state.doc.lines;
      const lineH = Math.max(0.35, Math.min(2.4, h / Math.max(lines, 1)));
      return { h, lines, lineH };
    }

    draw() {
      const { view, canvas } = this;
      const dpr = window.devicePixelRatio || 1;
      const { h, lines, lineH } = this.metrics();
      if (canvas.width !== WIDTH * dpr || canvas.height !== Math.round(h * dpr)) {
        canvas.width = WIDTH * dpr;
        canvas.height = Math.round(h * dpr);
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WIDTH, h);
      const el = view.dom;
      ctx.fillStyle = cssVar(el, "--minimap-fg", "rgba(150,160,180,.35)");
      const doc = view.state.doc;
      const step = lineH < 1 ? Math.ceil(1 / lineH) : 1;
      const barH = Math.max(1, lineH * 0.7);
      for (let i = 1; i <= lines; i += step) {
        const text = doc.line(i).text;
        if (!text.trim()) continue;
        const indent = text.length - text.trimStart().length;
        const x = 6 + Math.min(indent, 40) * 0.9;
        const w = Math.min(WIDTH - x - 4, text.trim().length * 0.9);
        ctx.fillRect(x, (i - 1) * lineH, Math.max(w, 1.5), barH);
      }
      // Penanda git di tepi kiri.
      const git = view.state.field(gitField, false);
      if (git) {
        for (const c of git.changes) {
          ctx.fillStyle = cssVar(el, c.type === "add" ? "--git-add" : c.type === "mod" ? "--git-mod" : "--git-del", "#888");
          if (c.type === "del") ctx.fillRect(0, (c.at - 1) * lineH - 1, 3, 2);
          else ctx.fillRect(0, (c.from - 1) * lineH, 3, Math.max(2, (c.to - c.from + 1) * lineH));
        }
      }
      // Penanda error/peringatan di tepi kanan.
      forEachDiagnostic(view.state, (d, from) => {
        const ln = doc.lineAt(Math.min(from, doc.length)).number;
        ctx.fillStyle = cssVar(el, d.severity === "error" ? "--danger" : "--warning", "#f43");
        ctx.fillRect(WIDTH - 5, (ln - 1) * lineH - 1, 5, Math.max(3, lineH));
      });
      // Area terlihat.
      const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      const bottom = view.lineBlockAtHeight(view.scrollDOM.scrollTop + view.scrollDOM.clientHeight);
      const l1 = doc.lineAt(top.from).number;
      const l2 = doc.lineAt(bottom.to).number;
      ctx.fillStyle = cssVar(el, "--minimap-view", "rgba(120,140,200,.14)");
      ctx.fillRect(0, (l1 - 1) * lineH, WIDTH, Math.max(16, (l2 - l1 + 1) * lineH));
    }

    scrollTo(clientY: number) {
      const rect = this.canvas.getBoundingClientRect();
      const { lines, lineH } = this.metrics();
      const line = Math.min(lines, Math.max(1, Math.round((clientY - rect.top) / lineH)));
      const pos = this.view.state.doc.line(line).from;
      this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }

    onDown = (e: PointerEvent) => {
      e.preventDefault();
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.scrollTo(e.clientY);
      const move = (ev: PointerEvent) => this.dragging && this.scrollTo(ev.clientY);
      const up = () => {
        this.dragging = false;
        this.canvas.removeEventListener("pointermove", move);
        this.canvas.removeEventListener("pointerup", up);
      };
      this.canvas.addEventListener("pointermove", move);
      this.canvas.addEventListener("pointerup", up);
    };

    destroy() {
      cancelAnimationFrame(this.raf);
      clearTimeout(this.timer);
      this.ro.disconnect();
      this.view.scrollDOM.removeEventListener("scroll", this.schedule);
      this.canvas.remove();
    }
  }
);

export const minimap = [
  plugin,
  EditorView.theme({ ".cm-scroller": { marginRight: `${WIDTH}px` } }),
];
