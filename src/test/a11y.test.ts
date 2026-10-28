/// <reference types="node" />
// Pemeriksaan aksesibilitas statis atas semua komponen: tombol ikon & input harus punya nama
// aksesibel, gambar harus punya alt. Mencegah regresi (tidak menggantikan uji pembaca layar).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : []));

/** Atribut tiap elemen `<name ...>` (kurung kurawal JSX dihitung supaya `=>` tidak dikira penutup). */
function* tags(s: string, name: string): Generator<{ at: number; attrs: string; inner: string }> {
  const re = new RegExp(`<${name}\\b`, "g");
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    // `<img` di dalam string/regex (mis. pengolahan HTML), bukan elemen JSX.
    if (/[/"'`(]/.test(s[m.index - 1] ?? "")) continue;
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const attrs = s.slice(m.index + m[0].length, i);
    const close = attrs.endsWith("/") ? -1 : s.indexOf(`</${name}>`, i);
    yield { at: m.index, attrs, inner: close > 0 ? s.slice(i + 1, close) : "" };
  }
}

describe("aksesibilitas", () => {
  const problems: string[] = [];
  for (const f of files(SRC)) {
    if (f.includes(`${path.sep}test${path.sep}`)) continue;
    const s = fs.readFileSync(f, "utf8");
    const where = (at: number) => `${path.relative(SRC, f)}:${s.slice(0, at).split("\n").length}`;
    for (const t of tags(s, "button")) {
      const named = /aria-label|aria-labelledby|title=/.test(t.attrs);
      // Isi hanya komponen ikon (<X size=… />) tanpa teks → butuh label.
      const iconOnly = t.inner.trim() !== "" && /^(\s*<[A-Z][\w.]*[^>]*\/>\s*)+$/.test(t.inner);
      if (iconOnly && !named) problems.push(`tombol ikon tanpa label: ${where(t.at)}`);
    }
    for (const n of ["input", "select", "textarea"]) {
      for (const t of tags(s, n)) {
        if (/type="(hidden|color|file|checkbox|radio)"/.test(t.attrs)) continue;
        if (/aria-label|aria-labelledby|\bid=|\{\.\.\./.test(t.attrs)) continue;
        const before = s.slice(Math.max(0, t.at - 300), t.at);
        if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue;
        problems.push(`${n} tanpa label: ${where(t.at)}`);
      }
    }
    for (const t of tags(s, "img")) if (!/alt=/.test(t.attrs) && !t.attrs.includes("${")) problems.push(`img tanpa alt: ${where(t.at)}`);
  }
  it("tombol ikon, input, dan gambar punya nama aksesibel", () => {
    expect(problems).toEqual([]);
  });
});
