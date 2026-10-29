// Literal objek gaya shell Mongo → JSON (EJSON): kunci tanpa kutip, kutip tunggal, koma di akhir,
// ObjectId("…"), ISODate("…") / new Date("…"), NumberLong("…"). Tanpa eval.

export function looseToJson(src: string): string {
  let s = src
    .replace(/\bObjectId\(\s*(["'])([0-9a-fA-F]{24})\1\s*\)/g, '{"$oid":"$2"}')
    .replace(/\b(?:ISODate|new\s+Date)\(\s*(["'])([^"']*)\1\s*\)/g, '{"$date":"$2"}')
    .replace(/\bNumberLong\(\s*(["']?)(-?\d+)\1\s*\)/g, '{"$numberLong":"$2"}')
    .replace(/\bNumberDecimal\(\s*(["'])([^"']*)\1\s*\)/g, '{"$numberDecimal":"$2"}');
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      let body = "";
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") {
          body += s[j] + (s[j + 1] ?? "");
          j += 2;
          continue;
        }
        body += s[j] === '"' ? '\\"' : s[j];
        j++;
      }
      out += `"${c === "'" ? body.replace(/\\'/g, "'") : body}"`;
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < s.length && /[\w$]/.test(s[j])) j++;
      const word = s.slice(i, j);
      let k = j;
      while (k < s.length && /\s/.test(s[k])) k++;
      if (s[k] === ":" && !["true", "false", "null"].includes(word)) out += `"${word}"`;
      else out += word;
      i = j - 1;
      continue;
    }
    if (c === ",") {
      let k = i + 1;
      while (k < s.length && /\s/.test(s[k])) k++;
      if (s[k] === "}" || s[k] === "]") continue;
    }
    out += c;
  }
  s = out;
  return s;
}

/** Pecah argumen fungsi tingkat atas: `{a:1}, {b:2}` → ["{a:1}", "{b:2}"]. */
export function splitArgs(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      cur += c;
      if (c === "\\") {
        cur += src[++i] ?? "";
        continue;
      }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") q = c;
    if ("{[(".includes(c)) depth++;
    if ("}])".includes(c)) depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
