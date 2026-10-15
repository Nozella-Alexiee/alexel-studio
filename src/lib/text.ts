// Utilitas teks murni (tanpa CodeMirror) supaya mudah dites.

/**
 * Tebak indentasi dari isi berkas: tab kalau baris berindentasi tab lebih banyak, kalau tidak
 * lebar spasi yang paling umum (2/4/8). Makefile selalu tab. null bila tidak ada petunjuk.
 */
export function detectIndent(text: string, filename = ""): string | null {
  if (/^(makefile|gnumakefile)$|\.mk$/i.test(filename)) return "\t";
  let tabs = 0;
  const widths = new Map<number, number>();
  let prev = 0;
  let n = 0;
  for (const line of text.split("\n", 4000)) {
    if (!line.trim()) continue;
    if (line[0] === "\t") {
      tabs++;
      continue;
    }
    const m = /^ +/.exec(line);
    const w = m ? m[0].length : 0;
    const d = Math.abs(w - prev);
    if (d >= 2 && d <= 8) widths.set(d, (widths.get(d) ?? 0) + 1);
    prev = w;
    n++;
  }
  if (tabs > 0 && tabs >= n / 2) return "\t";
  let best = 0;
  let bestCount = 0;
  for (const [w, c] of widths) if (c > bestCount || (c === bestCount && w < best)) [best, bestCount] = [w, c];
  return bestCount >= 3 ? " ".repeat(best) : null;
}

/** Bagian yang berbeda saja (awalan & akhiran yang sama dilewati), supaya kursor & scroll tetap. */
export function minimalChange(oldText: string, text: string): { from: number; to: number; insert: string } | null {
  if (oldText === text) return null;
  let start = 0;
  const max = Math.min(oldText.length, text.length);
  while (start < max && oldText.charCodeAt(start) === text.charCodeAt(start)) start++;
  let endOld = oldText.length;
  let endNew = text.length;
  while (endOld > start && endNew > start && oldText.charCodeAt(endOld - 1) === text.charCodeAt(endNew - 1)) {
    endOld--;
    endNew--;
  }
  return { from: start, to: endOld, insert: text.slice(start, endNew) };
}
