// Kotak warna di depan literal warna (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla()).
// Klik kotak → pemilih warna sistem; hasilnya menggantikan teks dengan format yang sama
// (hex tetap hex, rgb tetap rgb; hsl ditulis sebagai hex).

import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(\s*[\d.]+%?\s*(?:,|\s)\s*[\d.]+%?\s*(?:,|\s)\s*[\d.]+%?\s*(?:(?:,|\/)\s*[\d.]+%?\s*)?\)/g;

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Literal warna CSS → RGBA, atau null bila bukan warna yang valid. */
export function parseColor(text: string): Rgba | null {
  if (text.startsWith("#")) {
    let h = text.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (v: string, max: number) => (v.endsWith("%") ? (parseFloat(v) / 100) * max : parseFloat(v));
  const a = parts[3] !== undefined ? num(parts[3], 1) : 1;
  if (m[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((v) => Math.round(num(v, 255)));
    if ([r, g, b].some((x) => !(x >= 0 && x <= 255))) return null;
    return { r, g, b, a };
  }
  const [r, g, b] = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
  return { r, g, b, a };
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const toHex = (c: Rgba) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ""}`;

/** Tulis ulang warna baru (#rrggbb dari pemilih) dengan format literal aslinya; alpha lama dipertahankan. */
export function formatLike(original: string, pickedHex: string): string {
  const p = parseColor(pickedHex)!;
  const old = parseColor(original);
  const a = old?.a ?? 1;
  if (/^rgba?\(/.test(original)) return a < 1 ? `rgba(${p.r}, ${p.g}, ${p.b}, ${+a.toFixed(3)})` : `rgb(${p.r}, ${p.g}, ${p.b})`;
  const out = toHex({ ...p, a });
  return original.length === 4 && a === 1 && /^#(.)\1(.)\2(.)\3$/.test(out) ? `#${out[1]}${out[3]}${out[5]}` : out;
}

class Swatch extends WidgetType {
  constructor(readonly color: string, readonly from: number, readonly to: number) {
    super();
  }
  eq(o: Swatch) {
    return o.color === this.color && o.from === this.from;
  }
  toDOM(view: EditorView) {
    const s = document.createElement("span");
    s.className = "cm-color-swatch";
    s.style.setProperty("--swatch", this.color);
    s.title = this.color;
    s.setAttribute("role", "button");
    s.setAttribute("aria-label", `Pilih warna ${this.color}`);
    s.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const input = document.createElement("input");
      input.type = "color";
      const c = parseColor(this.color);
      input.value = c ? toHex({ ...c, a: 1 }) : "#000000";
      input.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:" + e.clientX + "px;top:" + e.clientY + "px";
      document.body.appendChild(input);
      let from = this.from;
      let current = this.color;
      input.addEventListener("input", () => {
        const next = formatLike(current, input.value);
        view.dispatch({ changes: { from, to: from + current.length, insert: next }, userEvent: "input.color" });
        current = next;
      });
      input.addEventListener("change", () => input.remove());
      input.addEventListener("blur", () => setTimeout(() => input.remove(), 0));
      input.click();
      from = this.from;
    });
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    COLOR_RE.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = COLOR_RE.exec(text)); ) {
      if (!parseColor(m[0])) continue;
      const start = from + m.index;
      // "#abc" di dalam kata/URL (mis. anchor) dilewati: sebelum "#" harus bukan huruf/angka/&.
      if (m[0].startsWith("#") && /[\w&/]/.test(view.state.doc.sliceString(start - 1, start))) continue;
      b.add(start, start, Decoration.widget({ widget: new Swatch(m[0], start, start + m[0].length), side: -1 }));
    }
  }
  return b.finish();
}

export const colorSwatches: Extension = [
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
  EditorView.theme({
    ".cm-color-swatch": {
      display: "inline-block",
      width: "0.8em",
      height: "0.8em",
      margin: "0 3px 0 1px",
      verticalAlign: "-0.05em",
      borderRadius: "2px",
      border: "1px solid color-mix(in srgb, var(--fg) 35%, transparent)",
      background: "linear-gradient(var(--swatch), var(--swatch)), repeating-conic-gradient(#999 0 25%, #fff 0 50%) 0 0 / 6px 6px",
      cursor: "pointer",
    },
  }),
];
