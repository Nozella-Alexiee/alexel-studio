// Fuzzy matcher kecil untuk Quick Open dan palette.
// Skor lebih tinggi untuk huruf berurutan, awal kata, dan kecocokan di nama berkas.

export interface FuzzyHit<T> {
  item: T;
  score: number;
  /** Indeks karakter yang cocok (untuk highlight). */
  positions: number[];
}

const SEPARATORS = new Set(["/", "\\", "-", "_", ".", " "]);

export function fuzzyScore(query: string, text: string): { score: number; positions: number[] } | null {
  if (!query) return { score: 0, positions: [] };
  const nameStart = text.lastIndexOf("/") + 1;
  const full = scoreFrom(query, text, 0, nameStart);
  // Pencocokan rakus dari kiri bisa "tersangkut" di folder; coba juga khusus nama berkas.
  const inName = nameStart > 0 ? scoreFrom(query, text, nameStart, nameStart) : null;
  if (full && inName) return inName.score >= full.score ? inName : full;
  return full ?? inName;
}

function scoreFrom(query: string, text: string, startAt: number, nameStart: number): { score: number; positions: number[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let ti = startAt;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    let s = 1;
    if (found === prev + 1) s += 5;
    if (found === 0 || SEPARATORS.has(text[found - 1])) s += 4;
    if (text[found] !== t[found] && text[found] === text[found].toUpperCase()) s += 2;
    if (found >= nameStart) s += 2;
    score += s;
    positions.push(found);
    prev = found;
    ti = found + 1;
  }
  // Teks pendek dan kecocokan persis di nama berkas lebih diutamakan.
  score -= text.length * 0.02;
  if (t.slice(nameStart).startsWith(q)) score += 10;
  return { score, positions };
}

export function fuzzyFilter<T>(query: string, items: T[], key: (t: T) => string, limit = 200): FuzzyHit<T>[] {
  const out: FuzzyHit<T>[] = [];
  for (const item of items) {
    const r = fuzzyScore(query, key(item));
    if (r) out.push({ item, score: r.score, positions: r.positions });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
