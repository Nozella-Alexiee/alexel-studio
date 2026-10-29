// Berkas .http / .rest (sintaks REST Client & JetBrains HTTP Client): request dipisah `###`, variabel
// berkas `@nama = nilai`, `# @name login` untuk merujuk respons, `{{var}}` dari environment, dan
// variabel dinamis {{$guid}} {{$timestamp}} {{$isoTimestamp}} {{$randomInt a b}}. {{$secret X}} dan
// {{$dotenv X}} dibiarkan apa adanya: diisi di main process.

export interface ParsedRequest {
  /** Indeks request di berkas. */
  index: number;
  name: string | null;
  method: string;
  url: string;
  headers: [string, string][];
  body: string | null;
  bodyFile: string | null;
  /** Baris (1-based) baris request (METHOD URL). */
  line: number;
  /** Rentang offset teks request di berkas. */
  from: number;
  to: number;
}

const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+/i;

export function parseHttpFile(text: string): { vars: Record<string, string>; requests: ParsedRequest[] } {
  const vars: Record<string, string> = {};
  const requests: ParsedRequest[] = [];
  const lines = text.split("\n");
  let offset = 0;
  const offsets = lines.map((l) => {
    const o = offset;
    offset += l.length + 1;
    return o;
  });
  // Blok dipisah baris `###` (boleh diikuti judul).
  const blocks: { start: number; end: number; title: string | null }[] = [];
  let start = 0;
  let title: string | null = null;
  lines.forEach((l, i) => {
    if (/^###/.test(l.trim())) {
      blocks.push({ start, end: i, title });
      start = i + 1;
      title = l.trim().replace(/^#+\s*/, "") || null;
    }
  });
  blocks.push({ start, end: lines.length, title });

  for (const b of blocks) {
    let i = b.start;
    let name: string | null = null;
    // Pra-request: komentar, variabel berkas, dan baris kosong.
    for (; i < b.end; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      const v = /^@([\w.-]+)\s*=\s*(.*)$/.exec(t);
      if (v) {
        vars[v[1]] = v[2].trim();
        continue;
      }
      const n = /^(?:#|\/\/)\s*@name\s+([\w.-]+)/.exec(t);
      if (n) {
        name = n[1];
        continue;
      }
      if (t.startsWith("#") || t.startsWith("//")) continue;
      break;
    }
    if (i >= b.end) continue;
    const reqLine = i;
    let first = lines[i].trim();
    // URL multi-baris: baris lanjutan diawali ? atau &.
    while (i + 1 < b.end && /^\s*[?&]/.test(lines[i + 1])) first += lines[++i].trim();
    const m = METHODS.exec(first);
    const method = m ? m[1].toUpperCase() : "GET";
    const url = (m ? first.slice(m[0].length) : first).replace(/\s+HTTP\/[\d.]+\s*$/i, "").trim();
    const headers: [string, string][] = [];
    for (i++; i < b.end; i++) {
      const t = lines[i];
      if (!t.trim()) break;
      if (/^\s*(#|\/\/)/.test(t)) continue;
      const h = /^\s*([^:\s][^:]*):\s?(.*)$/.exec(t);
      if (h) headers.push([h[1].trim(), h[2].trim()]);
    }
    let bodyLines = lines.slice(i + 1, b.end);
    // Buang skrip respons (`> {% ... %}`) dan baris kosong di akhir.
    const scriptAt = bodyLines.findIndex((l) => /^>\s*\{%/.test(l) || /^>\s*\S+\.js\s*$/.test(l));
    if (scriptAt >= 0) bodyLines = bodyLines.slice(0, scriptAt);
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
    let body: string | null = bodyLines.length ? bodyLines.join("\n") : null;
    let bodyFile: string | null = null;
    const fileRef = body && /^<\s+(\S.*)$/.exec(body.trim());
    if (fileRef && !body!.trim().includes("\n")) {
      bodyFile = fileRef[1].trim();
      body = null;
    }
    requests.push({
      index: requests.length,
      name: name ?? (b.title && /^[\w.-]+$/.test(b.title) ? b.title : null),
      method,
      url,
      headers,
      body,
      bodyFile,
      line: reqLine + 1,
      from: offsets[b.start] ?? 0,
      to: b.end < lines.length ? offsets[b.end] : text.length,
    });
  }
  return { vars, requests };
}

export interface ResponseRef {
  status: number;
  headers: [string, string][];
  text: string | null;
}

/** Ambil nilai dari JSON dengan jalur sederhana `$.a.b[0].c` (atau `a.b`). */
export function jsonPath(value: unknown, path: string): unknown {
  const parts = path.replace(/^\$\.?/, "").match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    const idx = /^\[(\d+)\]$/.exec(p);
    cur = idx ? (cur as unknown[])[Number(idx[1])] : (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Ganti {{…}} dengan nilai. Urutan: variabel berkas (boleh merujuk variabel lain), environment,
 * respons request bernama ({{login.response.body.$.token}}), lalu variabel dinamis.
 * Placeholder yang tidak dikenal dibiarkan apa adanya (main process menolak yang privat bila hilang).
 */
export function substitute(text: string, ctx: { vars: Record<string, string>; env: Record<string, string>; responses?: Record<string, ResponseRef>; now?: Date }, depth = 0): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, expr: string) => {
    if (/^\$(secret|dotenv)\s/.test(expr)) return whole;
    if (expr.startsWith("$")) {
      const [fn, ...args] = expr.slice(1).split(/\s+/);
      const now = ctx.now ?? new Date();
      if (fn === "guid" || fn === "uuid" || fn === "random.uuid") return crypto.randomUUID();
      if (fn === "timestamp") return String(Math.floor(now.getTime() / 1000));
      if (fn === "isoTimestamp") return now.toISOString();
      if (fn === "randomInt") {
        const a = Number(args[0] ?? 0);
        const b = Number(args[1] ?? 1000);
        return String(Math.floor(a + Math.random() * (b - a)));
      }
      return whole;
    }
    const ref = /^([\w-]+)\.response\.(body|headers)\.?(.*)$/.exec(expr);
    if (ref) {
      const r = ctx.responses?.[ref[1]];
      if (!r) return whole;
      if (ref[2] === "headers") return r.headers.find(([k]) => k.toLowerCase() === ref[3].toLowerCase())?.[1] ?? whole;
      if (!ref[3] || ref[3] === "*") return r.text ?? "";
      try {
        const v = jsonPath(JSON.parse(r.text ?? "null"), ref[3]);
        return v === undefined ? whole : typeof v === "object" ? JSON.stringify(v) : String(v);
      } catch {
        return whole;
      }
    }
    const v = ctx.vars[expr] ?? ctx.env[expr];
    if (v === undefined) return whole;
    return depth < 5 ? substitute(v, ctx, depth + 1) : v;
  });
}

/** Placeholder yang belum terisi setelah substitusi (selain $secret/$dotenv). */
export const unresolved = (s: string) => [...s.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]).filter((x) => !/^\$(secret|dotenv)\s/.test(x));

/** Pecah perintah shell (kutip tunggal/ganda, backslash, sambungan baris). */
export function shellWords(cmd: string): string[] {
  const s = cmd.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let has = false;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") q = null;
      else cur += c;
      continue;
    }
    if (q === '"') {
      if (c === "\\" && /["\\$`]/.test(s[i + 1] ?? "")) cur += s[++i];
      else if (c === '"') q = null;
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    cur += c;
  }
  if (has || cur) out.push(cur);
  return out;
}

export interface SimpleRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: string | null;
}

/** cURL → request. Mendukung -X, -H, -d/--data*, --json, -u, -A, -e, -b, -G, -I, --url. */
export function fromCurl(cmd: string): SimpleRequest {
  const w = shellWords(cmd.trim().replace(/^\$\s*/, ""));
  if (w[0] !== "curl") throw new Error("Bukan perintah curl.");
  let method: string | null = null;
  let url = "";
  const headers: [string, string][] = [];
  const data: string[] = [];
  let get = false;
  let json = false;
  for (let i = 1; i < w.length; i++) {
    const a = w[i];
    const next = () => w[++i] ?? "";
    if (a === "-X" || a === "--request") method = next().toUpperCase();
    else if (a.startsWith("-X") && a.length > 2) method = a.slice(2).toUpperCase();
    else if (a === "-H" || a === "--header") {
      const h = next();
      const c = h.indexOf(":");
      if (c > 0) headers.push([h.slice(0, c).trim(), h.slice(c + 1).trim()]);
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"].includes(a)) data.push(next());
    else if (a === "--json") {
      data.push(next());
      json = true;
    } else if (a === "-u" || a === "--user") headers.push(["Authorization", `Basic ${btoa(next())}`]);
    else if (a === "-A" || a === "--user-agent") headers.push(["User-Agent", next()]);
    else if (a === "-e" || a === "--referer") headers.push(["Referer", next()]);
    else if (a === "-b" || a === "--cookie") headers.push(["Cookie", next()]);
    else if (a === "-G" || a === "--get") get = true;
    else if (a === "-I" || a === "--head") method = "HEAD";
    else if (a === "--url") url = next();
    else if (["-o", "--output", "-w", "--write-out", "-m", "--max-time", "--connect-timeout", "-x", "--proxy", "--cacert", "--cert", "--key", "-F", "--form"].includes(a)) next();
    else if (!a.startsWith("-") && !url) url = a;
  }
  if (json) {
    if (!headers.some(([k]) => k.toLowerCase() === "content-type")) headers.push(["Content-Type", "application/json"]);
    if (!headers.some(([k]) => k.toLowerCase() === "accept")) headers.push(["Accept", "application/json"]);
  }
  let body: string | null = data.length ? data.join("&") : null;
  if (get && body) {
    url += (url.includes("?") ? "&" : "?") + body;
    body = null;
  }
  if (body && !headers.some(([k]) => k.toLowerCase() === "content-type")) headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
  return { method: method ?? (body ? "POST" : "GET"), url, headers, body };
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Request → perintah cURL (satu argumen per baris). */
export function toCurl(r: SimpleRequest): string {
  const parts = [`curl${r.method !== "GET" ? ` -X ${r.method}` : ""} ${sq(r.url)}`];
  for (const [k, v] of r.headers) parts.push(`-H ${sq(`${k}: ${v}`)}`);
  if (r.body) parts.push(`--data-raw ${sq(r.body)}`);
  return parts.join(" \\\n  ");
}

/** Request → teks .http. */
export function toHttpText(r: SimpleRequest, name?: string): string {
  const out = [name ? `# @name ${name}` : null, `${r.method} ${r.url}`, ...r.headers.map(([k, v]) => `${k}: ${v}`)].filter((x): x is string => x !== null);
  if (r.body) out.push("", r.body);
  return out.join("\n") + "\n";
}

/** Environment dari http-client.env.json (+ .private) atau .vscode/settings.json rest-client. */
export function mergeEnvFiles(pub: string | null, priv: string | null, vscodeSettings: string | null): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const add = (raw: string | null, pick?: (j: Record<string, unknown>) => unknown) => {
    if (!raw) return;
    try {
      const j = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
      const envs = (pick ? pick(j) : j) as Record<string, Record<string, unknown>> | undefined;
      if (!envs || typeof envs !== "object") return;
      for (const [name, vals] of Object.entries(envs)) {
        if (!vals || typeof vals !== "object") continue;
        out[name] = { ...(out[name] ?? {}) };
        for (const [k, v] of Object.entries(vals)) if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[name][k] = String(v);
      }
    } catch {
      /* JSON rusak: abaikan */
    }
  };
  add(vscodeSettings, (j) => j["rest-client.environmentVariables"]);
  add(pub);
  add(priv);
  return out;
}
