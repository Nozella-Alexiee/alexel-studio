// Berkas .env sebagai baris yang bisa diedit tanpa merusak komentar, urutan, atau gaya kutip.

export type EnvLine = { kind: "pair"; key: string; value: string; quote: "" | '"' | "'"; export: boolean; comment: string; raw: string } | { kind: "other"; raw: string };

export function parseEnvLines(text: string): EnvLine[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out: EnvLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const m = /^(\s*)(export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) {
      out.push({ kind: "other", raw });
      continue;
    }
    let rest = m[4];
    let value = rest;
    let quote: "" | '"' | "'" = "";
    let comment = "";
    let full = raw;
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const q = rest[0] as '"' | "'";
      // Nilai berkutip boleh multi-baris.
      let body = rest.slice(1);
      let end = findClose(body, q);
      while (end < 0 && i + 1 < lines.length) {
        i++;
        full += "\n" + lines[i];
        body += "\n" + lines[i];
        end = findClose(body, q);
      }
      if (end < 0) end = body.length;
      value = body.slice(0, end);
      if (q === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      quote = q;
      const after = body.slice(end + 1);
      comment = /^\s*(#.*)$/.exec(after)?.[1] ?? "";
    } else {
      const c = /\s+#.*$/.exec(rest);
      if (c) {
        comment = c[0].trim();
        rest = rest.slice(0, c.index);
      }
      value = rest.trim();
    }
    out.push({ kind: "pair", key: m[3], value, quote, export: !!m[2], comment, raw: full });
  }
  return out;
}

function findClose(s: string, q: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && q === '"') {
      i++;
      continue;
    }
    if (s[i] === q) return i;
  }
  return -1;
}

const needsQuote = (v: string) => v === "" ? false : /[\s#"'\\]|^$/.test(v) || v.includes("\n");

export function formatPair(key: string, value: string, quote: "" | '"' | "'" = "", exp = false, comment = ""): string {
  let q = quote;
  if (!q && needsQuote(value)) q = '"';
  if (q === "'" && (value.includes("'") || value.includes("\n"))) q = '"';
  const v = q === '"' ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"` : q === "'" ? `'${value}'` : value;
  return `${exp ? "export " : ""}${key}=${v}${comment ? ` ${comment}` : ""}`;
}

export function serializeEnv(lines: EnvLine[]): string {
  return lines.map((l) => (l.kind === "other" ? l.raw : formatPair(l.key, l.value, l.quote, l.export, l.comment))).join("\n") + "\n";
}

/** Ubah nilai satu kunci (atau tambah di akhir); baris lain tidak disentuh. */
export function setEnvValue(lines: EnvLine[], key: string, value: string | null): EnvLine[] {
  const i = lines.findIndex((l) => l.kind === "pair" && l.key === key);
  if (value === null) return i < 0 ? lines : lines.filter((_, j) => j !== i);
  if (i < 0) return [...lines, { kind: "pair", key, value, quote: "", export: false, comment: "", raw: "" }];
  const l = lines[i] as Extract<EnvLine, { kind: "pair" }>;
  return lines.map((x, j) => (j === i ? { ...l, value } : x));
}

export const envKeys = (lines: EnvLine[]) => lines.flatMap((l) => (l.kind === "pair" ? [l.key] : []));

/** .env.example dari .env: kunci & komentar dipertahankan, nilai dikosongkan. */
export function exampleFrom(lines: EnvLine[]): string {
  return serializeEnv(lines.map((l) => (l.kind === "pair" ? { ...l, value: "", quote: "" as const } : l)));
}

/** Kunci yang tampak rahasia (disamarkan di UI). */
export const looksSecret = (key: string) => /(SECRET|PASSWORD|PASSWD|PWD|TOKEN|API_?KEY|PRIVATE|CREDENTIAL|AUTH|DSN|_KEY$|DATABASE_URL|_URI$)/i.test(key);
