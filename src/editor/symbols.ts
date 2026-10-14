// Ekstraksi simbol cepat berbasis regex (fungsi, kelas, tipe) untuk outline dan "@" di palette.
// Sengaja sederhana supaya ringan; cukup akurat untuk navigasi.

export interface SymbolItem {
  name: string;
  kind: "fungsi" | "kelas" | "tipe" | "konstanta" | "metode" | "judul" | "struct" | "modul";
  line: number;
  depth: number;
}

type Rule = [RegExp, SymbolItem["kind"]];

const RULES: Record<string, Rule[]> = {
  ts: [
    [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, "fungsi"],
    [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, "kelas"],
    [/^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, "tipe"],
    [/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/, "fungsi"],
    [/^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=/, "konstanta"],
    [/^\s+(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/, "metode"],
  ],
  py: [
    [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, "fungsi"],
    [/^\s*class\s+([A-Za-z_]\w*)/, "kelas"],
  ],
  rs: [
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, "fungsi"],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/, "struct"],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:enum|trait|type)\s+([A-Za-z_]\w*)/, "tipe"],
    [/^\s*impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?([A-Za-z_][\w:<>]*)/, "kelas"],
    [/^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)/, "modul"],
  ],
  go: [
    [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, "fungsi"],
    [/^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, "tipe"],
  ],
  php: [
    [/^\s*(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*function\s+([A-Za-z_]\w*)/, "fungsi"],
    [/^\s*(?:final\s+|abstract\s+|readonly\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/, "kelas"],
  ],
  java: [
    [/^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/, "kelas"],
    [/^\s*(?:public|private|protected)\s+(?:static\s+)?[\w<>[\], ]+\s+([A-Za-z_]\w*)\s*\(/, "metode"],
  ],
  c: [[/^(?:static\s+|inline\s+)*[A-Za-z_][\w\s*]*?\s\**([A-Za-z_]\w*)\s*\([^;]*$/, "fungsi"], [/^\s*(?:typedef\s+)?struct\s+([A-Za-z_]\w*)/, "struct"]],
  css: [[/^([^\s{][^{]*?)\s*\{\s*$/, "kelas"]],
  md: [[/^(#{1,6})\s+(.+)/, "judul"]],
};
RULES.js = RULES.ts;
RULES.cpp = RULES.c;

export function extractSymbols(langId: string, text: string): SymbolItem[] {
  const rules = RULES[langId];
  if (!rules) return [];
  const out: SymbolItem[] = [];
  const lines = text.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length && out.length < 2000; i++) {
    const l = lines[i];
    if (langId === "md") {
      if (l.startsWith("```")) inFence = !inFence;
      if (inFence) continue;
      const m = l.match(/^(#{1,6})\s+(.+)/);
      if (m) out.push({ name: m[2].replace(/[#*`]/g, "").trim(), kind: "judul", line: i + 1, depth: m[1].length - 1 });
      continue;
    }
    if (l.length > 400) continue;
    for (const [re, kind] of rules) {
      const m = l.match(re);
      if (m && m[1] && !["if", "for", "while", "switch", "catch", "return", "function"].includes(m[1])) {
        out.push({ name: m[1].trim(), kind, line: i + 1, depth: Math.min(4, Math.floor((l.length - l.trimStart().length) / 2)) });
        break;
      }
    }
  }
  return out;
}
