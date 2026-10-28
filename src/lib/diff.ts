// Diff baris (algoritma Myers, O(ND)) untuk gutter perubahan git dan ringkasan time-travel.

export type LineChange =
  | { type: "add"; from: number; to: number } // baris baru [from, to] (1-based, inklusif) di dokumen sekarang
  | { type: "mod"; from: number; to: number }
  | { type: "del"; at: number }; // baris dihapus sebelum baris `at` di dokumen sekarang

interface Edit {
  a: number; // jumlah baris lama yang dihapus
  b: number; // jumlah baris baru yang ditambah
  posNew: number; // indeks 0-based di dokumen baru
}

function myers(a: string[], b: string[]): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  // Batas aman: berkas sangat besar dengan perubahan besar → anggap semua baru.
  if (n * m > 25_000_000 && Math.abs(n - m) > 5000) return [{ a: n, b: m, posNew: 0 }];
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  const off = max;
  let done = false;
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        done = true;
        break;
      }
    }
    if (d > 4000) return [{ a: n, b: m, posNew: 0 }];
  }
  // Backtrack menjadi daftar operasi per baris.
  const ops: ("=" | "-" | "+")[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const prevX = vv[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("=");
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push("+");
        y--;
      } else {
        ops.push("-");
        x--;
      }
    }
  }
  ops.reverse();
  const edits: Edit[] = [];
  let posNew = 0;
  let cur: Edit | null = null;
  for (const op of ops) {
    if (op === "=") {
      if (cur) edits.push(cur);
      cur = null;
      posNew++;
    } else {
      if (!cur) cur = { a: 0, b: 0, posNew };
      if (op === "-") cur.a++;
      else {
        cur.b++;
        posNew++;
      }
    }
  }
  if (cur) edits.push(cur);
  return edits;
}

export function splitLines(s: string): string[] {
  if (s === "") return [];
  const lines = s.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Perubahan dokumen `next` dibanding `prev`, untuk gutter. */
export function lineChanges(prev: string, next: string): LineChange[] {
  const edits = myers(splitLines(prev), splitLines(next));
  return edits.map((e) => {
    if (e.b === 0) return { type: "del", at: e.posNew + 1 };
    const from = e.posNew + 1;
    const to = e.posNew + e.b;
    return e.a === 0 ? { type: "add", from, to } : { type: "mod", from, to };
  });
}

export function diffStats(prev: string, next: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const e of myers(splitLines(prev), splitLines(next))) {
    added += e.b;
    removed += e.a;
  }
  return { added, removed };
}

export interface Hunk {
  /** Indeks baris lama (0-based) tempat perubahan dimulai. */
  oldStart: number;
  /** Jumlah baris lama yang diganti (0 = sisipan murni). */
  oldCount: number;
  /** Baris pengganti (kosong = hapus murni). */
  newLines: string[];
}

/** Blok perubahan per baris dari `prev` ke `next`, dipakai Claude inline untuk Terima/Tolak per bagian. */
export function lineHunks(prev: string, next: string): Hunk[] {
  const a = splitLines(prev);
  const b = splitLines(next);
  let shift = 0;
  return myers(a, b).map((e) => {
    const oldStart = e.posNew + shift;
    shift += e.a - e.b;
    return { oldStart, oldCount: e.a, newLines: b.slice(e.posNew, e.posNew + e.b) };
  });
}

export interface DiffRow {
  k: " " | "-" | "+" | "…";
  t: string;
}

/** Diff gabungan (unified) dengan 2 baris konteks, maksimal `limit` baris. */
export function diffRows(before: string, after: string, limit = 80): { rows: DiffRow[]; added: number; removed: number; more: number } {
  const a = splitLines(before);
  const hunks = lineHunks(before, after);
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let total = 0;
  let lastEnd = -1;
  for (const h of hunks) {
    const ctxFrom = Math.max(0, h.oldStart - 2, lastEnd);
    if (lastEnd >= 0 && ctxFrom > lastEnd) rows.push({ k: "…", t: "" });
    for (let i = ctxFrom; i < h.oldStart; i++) rows.push({ k: " ", t: a[i] });
    for (let i = 0; i < h.oldCount; i++) rows.push({ k: "-", t: a[h.oldStart + i] });
    for (const l of h.newLines) rows.push({ k: "+", t: l });
    removed += h.oldCount;
    added += h.newLines.length;
    const end = Math.min(a.length, h.oldStart + h.oldCount + 2);
    for (let i = h.oldStart + h.oldCount; i < end; i++) rows.push({ k: " ", t: a[i] });
    lastEnd = end;
  }
  total = rows.length;
  return { rows: rows.slice(0, limit), added, removed, more: Math.max(0, total - limit) };
}

/** Baris diff gabungan dari teks unified diff (keluaran git / Codex), tanpa header berkas. */
export function unifiedRows(diff: string, limit = 120): { rows: DiffRow[]; added: number; removed: number; more: number } {
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  for (const l of diff.split("\n")) {
    if (/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(l)) continue;
    if (l.startsWith("@@")) {
      if (rows.length) rows.push({ k: "…", t: "" });
      continue;
    }
    if (l.startsWith("+")) {
      rows.push({ k: "+", t: l.slice(1) });
      added++;
    } else if (l.startsWith("-")) {
      rows.push({ k: "-", t: l.slice(1) });
      removed++;
    } else if (l.startsWith(" ")) rows.push({ k: " ", t: l.slice(1) });
  }
  return { rows: rows.slice(0, limit), added, removed, more: Math.max(0, rows.length - limit) };
}

/** Satu bagian perubahan (relatif ke HEAD) yang memuat baris `line` (1-based) dokumen sekarang. */
export interface GitHunk {
  /** Indeks baris lama (0-based) awal perubahan. */
  oldStart: number;
  oldLines: string[];
  /** Indeks baris baru (0-based) awal perubahan. */
  newStart: number;
  newLines: string[];
}

export function hunkAtLine(prev: string, next: string, line: number): GitHunk | null {
  const a = splitLines(prev);
  const b = splitLines(next);
  let shift = 0;
  for (const e of myers(a, b)) {
    const oldStart = e.posNew + shift;
    shift += e.a - e.b;
    // Hapus murni ditandai di baris sesudahnya (di akhir berkas: baris terakhir), seperti gutter.
    const first = e.b === 0 ? Math.min(e.posNew + 1, Math.max(b.length, 1)) : e.posNew + 1;
    const last = e.b === 0 ? first : e.posNew + e.b;
    if (line >= first && line <= last) {
      return { oldStart, oldLines: a.slice(oldStart, oldStart + e.a), newStart: e.posNew, newLines: b.slice(e.posNew, e.posNew + e.b) };
    }
  }
  return null;
}

/**
 * Patch `git apply --unidiff-zero` untuk satu bagian. `rel` = path relatif terhadap akar repo (pakai /).
 * Penanda "\\ No newline at end of file" ditambahkan bila bagian menyentuh baris terakhir tanpa newline.
 */
export function hunkPatch(rel: string, prev: string, next: string, h: GitHunk): string {
  const oldTotal = splitLines(prev).length;
  const newTotal = splitLines(next).length;
  const a = h.oldLines.length ? `${h.oldStart + 1},${h.oldLines.length}` : `${h.oldStart},0`;
  const b = h.newLines.length ? `${h.newStart + 1},${h.newLines.length}` : `${h.newStart},0`;
  const out = [`diff --git a/${rel} b/${rel}`, `--- a/${rel}`, `+++ b/${rel}`, `@@ -${a} +${b} @@`];
  for (const l of h.oldLines) out.push(`-${l}`);
  if (h.oldLines.length && h.oldStart + h.oldLines.length === oldTotal && prev !== "" && !prev.endsWith("\n")) out.push("\\ No newline at end of file");
  for (const l of h.newLines) out.push(`+${l}`);
  if (h.newLines.length && h.newStart + h.newLines.length === newTotal && next !== "" && !next.endsWith("\n")) out.push("\\ No newline at end of file");
  return out.join("\n") + "\n";
}
