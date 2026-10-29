// Deteksi database di project: URL di `.env*`, datasource Prisma, layanan docker-compose, dan berkas
// SQLite. Hasil untuk renderer tanpa password; menyimpan saran dilakukan ulang di main lewat `key`.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { kindFromUrl, splitUrlPassword } from "./index";
import type { DbKind } from "./types";

export interface Detected {
  key: string;
  name: string;
  kind: DbKind;
  url?: string;
  file?: string;
  /** Asal saran, mis. ".env · DATABASE_URL". */
  source: string;
  hasPassword: boolean;
}

type Full = Detected & { password?: string };

const SKIP = new Set(["node_modules", ".git", "dist", "build", "vendor", ".venv", "venv", "target", ".next", "out"]);
const URL_KEYS = /^(DATABASE_URL|DB_URL|DIRECT_URL|POSTGRES(?:QL)?_URL|PG_URL|MYSQL_URL|MARIADB_URL|MONGO(?:DB)?_(?:URI|URL)|REDIS_(?:URL|URI)|SQLITE_(?:PATH|URL|FILE)|\w*_DATABASE_URL)$/;

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

const keyOf = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

function fromUrl(url: string, source: string, root: string): Full | null {
  const kind = kindFromUrl(url);
  if (!kind) return null;
  if (kind === "sqlite") {
    const f = url.replace(/^(file|sqlite):(\/\/)?/i, "");
    const file = path.resolve(root, f);
    return { key: keyOf(source + file), name: path.basename(file), kind, file, source, hasPassword: false };
  }
  if (/\$\{|\{\{/.test(url)) return null;
  const s = splitUrlPassword(url);
  let name = kind as string;
  try {
    const u = new URL(s.url);
    name = `${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname && u.pathname !== "/" ? u.pathname : ""}`;
  } catch {
    return null;
  }
  return { key: keyOf(source + s.url), name, kind, url: s.url, source, hasPassword: !!s.password, password: s.password };
}

function readSafe(p: string, max = 512 * 1024): string | null {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > max) return null;
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

const IMAGE_KIND: [RegExp, DbKind, number][] = [
  [/(^|\/)(postgres|postgis\/postgis|bitnami\/postgresql|timescale)/, "postgres", 5432],
  [/(^|\/)(mysql|mariadb|bitnami\/mysql|bitnami\/mariadb)/, "mysql", 3306],
  [/(^|\/)(mongo|bitnami\/mongodb)/, "mongodb", 27017],
  [/(^|\/)(redis|valkey|bitnami\/redis|redis\/redis-stack)/, "redis", 6379],
];

/** Urai docker-compose sederhana (indentasi YAML) tanpa pustaka YAML. */
export function composeServices(text: string): { name: string; image: string; ports: string[]; env: Record<string, string> }[] {
  const out: { name: string; image: string; ports: string[]; env: Record<string, string> }[] = [];
  const lines = text.split(/\r?\n/);
  let inServices = false;
  let svcIndent = -1;
  let cur: (typeof out)[number] | null = null;
  let section: string | null = null;
  let sectionIndent = -1;
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (indent === 0) {
      inServices = /^services:\s*$/.test(t);
      cur = null;
      continue;
    }
    if (!inServices) continue;
    if (svcIndent < 0) svcIndent = indent;
    if (indent === svcIndent && /^[\w.-]+:\s*$/.test(t)) {
      cur = { name: t.slice(0, -1).trim(), image: "", ports: [], env: {} };
      out.push(cur);
      section = null;
      continue;
    }
    if (!cur) continue;
    if (section && indent <= sectionIndent) section = null;
    const kv = /^([\w.-]+):\s*(.*)$/.exec(t);
    if (!section && kv) {
      if (kv[1] === "image") cur.image = kv[2].replace(/^["']|["']$/g, "");
      else if (kv[1] === "ports" || kv[1] === "environment") {
        section = kv[1];
        sectionIndent = indent;
        const inline = /^\[(.*)\]$/.exec(kv[2]);
        if (inline && kv[1] === "ports") cur.ports.push(...inline[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")));
      }
      continue;
    }
    if (section === "ports") cur.ports.push(t.replace(/^-\s*/, "").replace(/^["']|["']$/g, ""));
    if (section === "environment") {
      const m = /^-?\s*["']?([\w.]+)\s*[=:]\s*(.*?)["']?$/.exec(t);
      if (m) cur.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function fromCompose(text: string, source: string): Full[] {
  const out: Full[] = [];
  for (const s of composeServices(text)) {
    const hit = IMAGE_KIND.find(([re]) => re.test(s.image));
    if (!hit) continue;
    const [, kind, port] = hit;
    const mapped = s.ports.map((p) => p.split(":")).find((parts) => Number(parts[parts.length - 1].split("/")[0]) === port);
    const host = mapped && mapped.length >= 2 ? Number(mapped[mapped.length - 2]) : null;
    if (!host) continue;
    const e = s.env;
    let user = "";
    let password = "";
    let db = "";
    if (kind === "postgres") {
      user = e.POSTGRES_USER || "postgres";
      password = e.POSTGRES_PASSWORD || "";
      db = e.POSTGRES_DB || user;
    } else if (kind === "mysql") {
      user = e.MYSQL_USER || e.MARIADB_USER || "root";
      password = (user === "root" ? e.MYSQL_ROOT_PASSWORD || e.MARIADB_ROOT_PASSWORD : e.MYSQL_PASSWORD || e.MARIADB_PASSWORD) || "";
      db = e.MYSQL_DATABASE || e.MARIADB_DATABASE || "";
    } else if (kind === "mongodb") {
      user = e.MONGO_INITDB_ROOT_USERNAME || "";
      password = e.MONGO_INITDB_ROOT_PASSWORD || "";
      db = e.MONGO_INITDB_DATABASE || "";
    }
    if (/\$\{/.test(password)) password = "";
    const scheme = kind === "postgres" ? "postgresql" : kind;
    const auth = user ? `${encodeURIComponent(user)}@` : "";
    const url = `${scheme}://${auth}localhost:${host}/${kind === "redis" ? "" : db}${kind === "mongodb" && user ? "?authSource=admin" : ""}`;
    out.push({ key: keyOf(source + s.name), name: `${s.name} (compose)`, kind, url, source: `${source} · ${s.name}`, hasPassword: !!password, password: password || undefined });
  }
  return out;
}

function walkSqlite(root: string, depth: number, out: Full[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length > 30) return;
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !SKIP.has(e.name) && !e.name.startsWith(".")) walkSqlite(p, depth - 1, out);
    } else if (/\.(db|sqlite|sqlite3|db3)$/i.test(e.name)) {
      const head = Buffer.alloc(16);
      try {
        const fd = fs.openSync(p, "r");
        fs.readSync(fd, head, 0, 16, 0);
        fs.closeSync(fd);
      } catch {
        continue;
      }
      if (head.toString("latin1").startsWith("SQLite format 3")) out.push({ key: keyOf("file" + p), name: e.name, kind: "sqlite", file: p, source: "berkas", hasPassword: false });
    }
  }
}

export function detectFull(root: string): Full[] {
  const out: Full[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  for (const n of names.filter((n) => /^\.env(\..+)?$/.test(n)).sort()) {
    const text = readSafe(path.join(root, n));
    if (!text) continue;
    for (const [k, v] of Object.entries(parseEnv(text))) {
      if (!URL_KEYS.test(k) && !/^(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|rediss?):\/\//i.test(v)) continue;
      const d = fromUrl(v, `${n} · ${k}`, root);
      if (d) out.push(d);
    }
  }
  const prisma = readSafe(path.join(root, "prisma", "schema.prisma"));
  if (prisma) {
    const m = /datasource\s+\w+\s*\{[^}]*url\s*=\s*"([^"]+)"/.exec(prisma);
    if (m) {
      const d = fromUrl(m[1], "prisma/schema.prisma", path.join(root, "prisma"));
      if (d) out.push(d);
    }
  }
  for (const n of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    const text = readSafe(path.join(root, n));
    if (text) out.push(...fromCompose(text, n));
  }
  walkSqlite(root, 2, out);
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = d.kind + (d.url ?? d.file);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const detect = (root: string): Detected[] => detectFull(root).map(({ password: _p, ...d }) => d);
