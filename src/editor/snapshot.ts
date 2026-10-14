// Render potongan kode jadi gambar PNG ber-highlight sesuai desain aktif.
// Digambar langsung di <canvas> (tanpa library screenshot) supaya ringan.

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";

const H = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.operatorKeyword], class: "--syn-keyword" },
  { tag: [t.processingInstruction, t.tagName, t.angleBracket], class: "--syn-tag" },
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue, t.docString], class: "--syn-string" },
  { tag: [t.regexp, t.escape], class: "--syn-regexp" },
  { tag: [t.number, t.integer, t.float], class: "--syn-number" },
  { tag: [t.bool, t.null, t.atom], class: "--syn-atom" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: "--syn-function" },
  { tag: [t.annotation, t.attributeName, t.meta], class: "--syn-attr" },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], class: "--syn-type" },
  { tag: t.namespace, class: "--syn-namespace" },
  { tag: [t.constant(t.variableName), t.standard(t.variableName)], class: "--syn-constant" },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], class: "--syn-definition" },
  { tag: t.variableName, class: "--syn-variable" },
  { tag: [t.propertyName, t.labelName], class: "--syn-property" },
  { tag: [t.operator, t.derefOperator, t.definitionOperator, t.compareOperator, t.arithmeticOperator, t.logicOperator], class: "--syn-operator" },
  { tag: [t.punctuation, t.separator, t.bracket, t.paren, t.brace, t.squareBracket], class: "--syn-punct" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: "--syn-comment" },
  { tag: t.heading, class: "--syn-heading" },
  { tag: [t.link, t.url], class: "--syn-link" },
]);

export interface SnapshotOptions {
  title: string;
  lineNumbers: boolean;
  chrome: boolean;
  padding: number;
  fontSize: number;
  background: "design" | "accent" | "transparent";
  scale: number;
}

interface Span {
  text: string;
  color: string;
}

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Baris yang akan dirender: seleksi (dibulatkan ke baris penuh) atau seluruh berkas (maks 400 baris). */
export function snapshotRange(state: EditorState): { from: number; to: number; firstLine: number } {
  const sel = state.selection.main;
  if (!sel.empty) {
    const a = state.doc.lineAt(sel.from);
    const b = state.doc.lineAt(sel.to > sel.from && state.doc.lineAt(sel.to).from === sel.to ? sel.to - 1 : sel.to);
    return { from: a.from, to: b.to, firstLine: a.number };
  }
  const last = state.doc.line(Math.min(state.doc.lines, 400));
  return { from: 0, to: last.to, firstLine: 1 };
}

function tokenize(state: EditorState, from: number, to: number): Span[][] {
  const fg = css("--ed-fg", "#ddd");
  const colors = new Map<string, string>();
  const colorOf = (cls: string) => {
    const k = cls.split(" ")[0];
    if (!colors.has(k)) colors.set(k, css(k, fg));
    return colors.get(k)!;
  };
  const text = state.sliceDoc(from, to);
  const styles: (string | null)[] = new Array(text.length).fill(null);
  highlightTree(
    syntaxTree(state),
    H,
    (f, tt, cls) => {
      const c = colorOf(cls);
      for (let i = Math.max(f, from); i < Math.min(tt, to); i++) styles[i - from] = c;
    },
    from,
    to
  );
  const lines: Span[][] = [[]];
  let cur: Span | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      lines.push([]);
      cur = null;
      continue;
    }
    const c = styles[i] ?? fg;
    const line = lines[lines.length - 1];
    if (cur && cur.color === c) cur.text += ch === "\t" ? "  " : ch;
    else {
      cur = { text: ch === "\t" ? "  " : ch, color: c };
      line.push(cur);
    }
  }
  return lines;
}

export function renderSnapshot(state: EditorState, o: SnapshotOptions): HTMLCanvasElement {
  const { from, to, firstLine } = snapshotRange(state);
  const lines = tokenize(state, from, to);
  while (lines.length > 1 && !lines[lines.length - 1].some((sp) => sp.text.trim())) lines.pop();
  // Buang indentasi bersama supaya potongan rapi.
  const indents = lines.filter((l) => l.map((s) => s.text).join("").trim()).map((l) => (l.map((s) => s.text).join("").match(/^ */)?.[0].length ?? 0));
  const common = indents.length ? Math.min(...indents) : 0;
  if (common > 0) {
    for (const l of lines) {
      let cut = common;
      while (cut > 0 && l.length) {
        const sp = l[0];
        const n = Math.min(cut, sp.text.length);
        sp.text = sp.text.slice(n);
        cut -= n;
        if (!sp.text) l.shift();
      }
    }
  }

  const font = css("--font-mono", "Menlo, monospace");
  const lh = Math.round(o.fontSize * 1.6);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `${o.fontSize}px ${font}`;
  const charW = measure.measureText("M").width;
  const gutterW = o.lineNumbers ? String(firstLine + lines.length).length * charW + 24 : 0;
  const maxCols = Math.min(160, Math.max(20, ...lines.map((l) => l.reduce((a, s) => a + s.text.length, 0))));
  const chromeH = o.chrome ? 40 : 0;
  const cardW = Math.ceil(gutterW + maxCols * charW + 48);
  const cardH = Math.ceil(chromeH + lines.length * lh + 36);
  const outer = o.background === "transparent" ? 0 : o.padding;
  const W = cardW + outer * 2;
  const Hh = cardH + outer * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * o.scale);
  canvas.height = Math.round(Hh * o.scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(o.scale, o.scale);

  if (o.background === "design") {
    ctx.fillStyle = css("--snap-bg", css("--bg", "#111"));
    ctx.fillRect(0, 0, W, Hh);
  } else if (o.background === "accent") {
    ctx.fillStyle = css("--accent", "#7aa2f7");
    ctx.fillRect(0, 0, W, Hh);
  }

  const r = 12;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(outer, outer, cardW, cardH, r);
  if (o.background !== "transparent") {
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
  }
  ctx.fillStyle = css("--ed-bg", "#161923");
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = css("--border", "rgba(255,255,255,.08)");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(outer + 0.5, outer + 0.5, cardW - 1, cardH - 1, r);
  ctx.stroke();

  if (o.chrome) {
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(outer + 20 + i * 18, outer + 20, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = css("--fg-muted", "#888");
    ctx.font = `500 12px ${css("--font-ui", "-apple-system, sans-serif")}`;
    ctx.textAlign = "center";
    ctx.fillText(o.title, outer + cardW / 2, outer + 24);
    ctx.textAlign = "left";
  }

  ctx.font = `${o.fontSize}px ${font}`;
  ctx.textBaseline = "middle";
  const x0 = outer + 24 + gutterW;
  lines.forEach((spans, i) => {
    const y = outer + chromeH + 18 + i * lh + lh / 2;
    if (o.lineNumbers) {
      ctx.fillStyle = css("--ed-gutter-fg", "#555");
      ctx.textAlign = "right";
      ctx.fillText(String(firstLine + i), x0 - 14, y);
      ctx.textAlign = "left";
    }
    let x = x0;
    for (const s of spans) {
      ctx.fillStyle = s.color;
      const txt = s.text.length + (x - x0) / charW > maxCols ? s.text.slice(0, Math.max(0, maxCols - Math.round((x - x0) / charW))) : s.text;
      ctx.fillText(txt, x, y);
      x += txt.length * charW;
    }
  });
  return canvas;
}
