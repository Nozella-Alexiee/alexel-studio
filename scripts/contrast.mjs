#!/usr/bin/env node
// Ukur kontras pasangan warna penting di tiap desain (src/styles/tokens.css).
//   node scripts/contrast.mjs          → tabel yang gagal
//   node scripts/contrast.mjs --all    → semua pasangan
// Dipakai juga oleh src/test/contrast.test.ts supaya regresi tertangkap.
import fs from "node:fs";

export const DESIGNS = ["studio", "studio-light", "aurora", "antartika", "zen", "kawanan", "control", "tuxedo"];

export function parseTokens(css) {
  // Komentar dibuang dulu: tanda { } di dalamnya mengacaukan pemecahan blok.
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  let depth = 0, head = "", body = "";
  for (const ch of css) {
    if (ch === "{") { depth++; if (depth === 1) { body = ""; continue; } }
    else if (ch === "}") { depth--; if (depth === 0) { const vars = {}; for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim(); blocks.push({ selectors: head.split(",").map((x) => x.trim()), vars }); head = ""; continue; } }
    if (depth === 0) head += ch; else body += ch;
  }
  const resolve = (design) => {
    const sel = design === "aurora" ? [":root", '[data-design="aurora"]'] : [":root", `[data-design="${design}"]`];
    const out = {};
    for (const b of blocks) if (b.selectors.some((s) => sel.includes(s))) Object.assign(out, b.vars);
    return out;
  };
  return { resolve };
}

function hex(c) {
  c = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split("").map((x) => parseInt(x + x, 16));
  m = /^#([0-9a-f]{6})/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
const lum = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** [nama, fg, bg, minimum] — 4.5 teks biasa, 3 untuk UI/teks besar/ikon. */
export const PAIRS = [
  ["teks", "--fg", "--bg", 4.5],
  ["teks di surface-2", "--fg", "--surface-2", 4.5],
  ["teks redup di bg", "--fg-muted", "--bg", 4.5],
  ["teks redup di surface-1", "--fg-muted", "--surface-1", 4.5],
  ["teks redup di surface-2", "--fg-muted", "--surface-2", 4.5],
  ["teks redup di surface-3", "--fg-muted", "--surface-3", 4.5],
  ["ikon/teks samar di bg", "--fg-subtle", "--bg", 3],
  ["ikon/teks samar di surface-2", "--fg-subtle", "--surface-2", 3],
  ["tombol utama", "--accent-fg", "--accent", 4.5],
  ["aksen sebagai teks", "--accent-text", "--bg", 4.5],
  ["tombol Claude", "--claude-fg", "--claude", 4.5],
  ["editor teks", "--ed-fg", "--ed-bg", 4.5],
  ["nomor baris", "--ed-gutter-fg", "--ed-bg", 3],
  ["komentar", "--syn-comment", "--ed-bg", 3],
  ["terminal teks", "--term-fg", "--term-bg", 4.5],
  ["ANSI hitam terang", "--ansi-bright-black", "--term-bg", 3],
  ["ANSI hijau", "--ansi-green", "--term-bg", 3],
  ["ANSI biru", "--ansi-blue", "--term-bg", 3],
  ["ANSI putih terang", "--ansi-bright-white", "--term-bg", 3],
  ["peringatan", "--warning", "--bg", 3],
  ["bahaya", "--danger", "--bg", 3],
];

export function audit(css = fs.readFileSync("src/styles/tokens.css", "utf8")) {
  const t = parseTokens(css);
  const rows = [];
  for (const d of DESIGNS) {
    const v = t.resolve(d);
    for (const [name, f, b, min] of PAIRS) {
      // --accent-text jatuh ke --accent bila desain tidak mendefinisikannya.
      const fv = v[f] && !v[f].startsWith("var(") ? v[f] : f === "--accent-text" ? v["--accent"] : v[f];
      const fc = hex(fv ?? ""), bc = hex(v[b] ?? "");
      if (!fc || !bc) continue;
      rows.push({ design: d, name, fg: fv, bg: v[b], ratio: ratio(fc, bc), min });
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = process.argv.includes("--all");
  const rows = audit().filter((r) => all || r.ratio < r.min);
  for (const r of rows) console.log(`${r.design.padEnd(13)} ${r.name.padEnd(28)} ${r.fg.padEnd(9)} on ${r.bg.padEnd(9)} ${r.ratio.toFixed(2)} (min ${r.min})${r.ratio < r.min ? "  ✗" : ""}`);
  console.log(`\n${rows.filter((r) => r.ratio < r.min).length} gagal dari ${audit().length} pasangan`);
}
