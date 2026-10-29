// Manager koneksi database: profil di userData/db-connections.json (tanpa password), password di
// secrets.ts (terenkripsi), satu driver aktif per profil (dibuat lazy), penegakan read-only & konfirmasi
// query berisiko, riwayat per koneksi, ekspor CSV/JSON, dan edit baris ber-PK.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Ctx } from "../util";
import { getSecret, setSecret } from "../secrets";
import type { Driver } from "./driver";
import { placeholder, quoteIdent } from "./driver";
import { isWrite, riskOf } from "./risk";
import type { DbConnection, DbKind, DbSchema, QueryOptions, QueryResult } from "./types";

const KINDS: DbKind[] = ["postgres", "mysql", "sqlite", "mongodb", "redis"];
const DEFAULT_PORT: Record<DbKind, number> = { postgres: 5432, mysql: 3306, sqlite: 0, mongodb: 27017, redis: 6379 };
const file = (ctx: Ctx) => path.join(ctx.userData, "db-connections.json");
const historyFile = (ctx: Ctx, id: string) => path.join(ctx.userData, "db-history", `${id.replace(/[^\w-]/g, "")}.json`);
const secretKey = (id: string) => `db:${id}`;

export function listConnections(ctx: Ctx): DbConnection[] {
  try {
    const j = JSON.parse(fs.readFileSync(file(ctx), "utf8"));
    return Array.isArray(j) ? (j as DbConnection[]).map((c) => ({ ...c, hasPassword: !!getSecret(ctx, secretKey(c.id)) })) : [];
  } catch {
    return [];
  }
}

function writeConnections(ctx: Ctx, list: DbConnection[]) {
  fs.mkdirSync(ctx.userData, { recursive: true });
  const tmp = file(ctx) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list.map(({ hasPassword: _h, ...c }) => c), null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file(ctx));
}

/** Pisahkan password dari URL (`postgres://u:p@h/db` → url tanpa p, password p). */
export function splitUrlPassword(url: string): { url: string; password?: string } {
  try {
    const u = new URL(url);
    if (!u.password) return { url };
    const password = decodeURIComponent(u.password);
    u.password = "";
    return { url: u.toString(), password };
  } catch {
    return { url };
  }
}

export function kindFromUrl(url: string): DbKind | null {
  const p = /^([a-z+]+):/i.exec(url)?.[1]?.toLowerCase() ?? "";
  if (p.startsWith("postgres")) return "postgres";
  if (p === "mysql" || p === "mariadb" || p.startsWith("mysql")) return "mysql";
  if (p.startsWith("mongodb")) return "mongodb";
  if (p === "redis" || p === "rediss") return "redis";
  if (p === "file" || p === "sqlite") return "sqlite";
  return null;
}

/** Simpan profil (baru bila tanpa id). `password`: string = ganti, "" = hapus, undefined = biarkan. */
export function saveConnection(ctx: Ctx, input: Partial<DbConnection> & { password?: string }): DbConnection {
  const { password, hasPassword: _h, ...rest } = input;
  if (!rest.kind || !KINDS.includes(rest.kind)) throw new Error("Jenis database tidak dikenal.");
  let pw = password;
  if (rest.url) {
    const s = splitUrlPassword(rest.url.trim());
    rest.url = s.url;
    if (s.password && pw === undefined) pw = s.password;
  }
  if (rest.kind === "sqlite" && !rest.file && rest.url) rest.file = rest.url.replace(/^(file|sqlite):(\/\/)?/i, "");
  const list = listConnections(ctx);
  const id = rest.id && list.some((c) => c.id === rest.id) ? rest.id : randomUUID();
  const conn: DbConnection = { ...rest, id, name: (rest.name || defaultName(rest as DbConnection)).slice(0, 120), kind: rest.kind };
  const i = list.findIndex((c) => c.id === id);
  if (i >= 0) list[i] = conn;
  else list.push(conn);
  writeConnections(ctx, list);
  if (pw !== undefined) setSecret(ctx, secretKey(id), pw || null);
  void closeDriver(id);
  return { ...conn, hasPassword: !!getSecret(ctx, secretKey(id)) };
}

function defaultName(c: DbConnection): string {
  if (c.kind === "sqlite") return path.basename(c.file ?? "database.db");
  if (c.url) {
    try {
      const u = new URL(c.url);
      return `${u.hostname}${u.pathname && u.pathname !== "/" ? u.pathname : ""}`;
    } catch {
      /* lanjut */
    }
  }
  return `${c.host ?? "localhost"}${c.database ? "/" + c.database : ""}`;
}

export async function removeConnection(ctx: Ctx, id: string) {
  writeConnections(ctx, listConnections(ctx).filter((c) => c.id !== id));
  setSecret(ctx, secretKey(id), null);
  await closeDriver(id);
  fs.rmSync(historyFile(ctx, id), { force: true });
}

const drivers = new Map<string, Promise<Driver>>();

async function closeDriver(id: string) {
  const d = drivers.get(id);
  drivers.delete(id);
  if (d) await d.then((x) => x.close()).catch(() => {});
}

export async function closeAll() {
  await Promise.all([...drivers.keys()].map(closeDriver));
}

/** URL lengkap (dengan password) untuk driver berbasis URL. */
function fullUrl(c: DbConnection, password: string | null): string {
  const scheme = c.kind === "postgres" ? "postgresql" : c.kind === "mongodb" ? "mongodb" : c.kind;
  const u = new URL(c.url || `${scheme}://${c.host || "localhost"}:${c.port || DEFAULT_PORT[c.kind]}/${c.kind === "redis" ? "" : c.database ?? ""}`);
  if (!c.url && c.user) u.username = c.user;
  if (password) u.password = password;
  return u.toString();
}

async function makeDriver(ctx: Ctx, c: DbConnection): Promise<Driver> {
  const pw = getSecret(ctx, secretKey(c.id));
  const ro = !!c.readOnly;
  switch (c.kind) {
    case "postgres": {
      const { postgresDriver } = await import("./drivers/postgres");
      const conf = c.url ? { connectionString: fullUrl(c, pw) } : { host: c.host || "localhost", port: c.port || 5432, user: c.user, password: pw ?? undefined, database: c.database };
      return postgresDriver({ ...conf, ...(c.ssl ? { ssl: { rejectUnauthorized: false } } : {}) }, ro);
    }
    case "mysql": {
      const { mysqlDriver } = await import("./drivers/mysql");
      const conf = c.url ? { uri: fullUrl(c, pw) } : { host: c.host || "localhost", port: c.port || 3306, user: c.user, password: pw ?? undefined, database: c.database };
      return mysqlDriver({ ...conf, ...(c.ssl ? { ssl: {} } : {}) }, ro);
    }
    case "sqlite": {
      const { sqliteDriver } = await import("./drivers/sqlite");
      if (!c.file) throw new Error("Berkas SQLite belum dipilih.");
      return sqliteDriver(c.file, ro);
    }
    case "mongodb": {
      const { mongoDriver } = await import("./drivers/mongo");
      const url = fullUrl(c, pw);
      const db = c.database || (new URL(url).pathname.slice(1) || undefined);
      return mongoDriver(url, db, ro);
    }
    case "redis": {
      const { redisDriver } = await import("./drivers/redis");
      const n = c.database && /^\d+$/.test(c.database) ? Number(c.database) : undefined;
      return redisDriver(fullUrl(c, pw), n, ro);
    }
  }
}

function connection(ctx: Ctx, id: string): DbConnection {
  const c = listConnections(ctx).find((x) => x.id === id);
  if (!c) throw new Error("Koneksi tidak ditemukan.");
  return c;
}

async function driverFor(ctx: Ctx, id: string): Promise<Driver> {
  let d = drivers.get(id);
  if (!d) {
    d = makeDriver(ctx, connection(ctx, id));
    drivers.set(id, d);
    d.catch(() => drivers.delete(id));
  }
  return d;
}

/** Uji profil (tersimpan atau belum) tanpa menyimpannya; kembalikan versi server. */
export async function testConnection(ctx: Ctx, input: Partial<DbConnection> & { password?: string }): Promise<string> {
  const base = input.id ? listConnections(ctx).find((c) => c.id === input.id) : undefined;
  let c = { ...base, ...input, id: input.id ?? "__test__" } as DbConnection;
  let pw = input.password ?? (base ? getSecret(ctx, secretKey(base.id)) : null);
  if (c.url) {
    const s = splitUrlPassword(c.url);
    c = { ...c, url: s.url };
    if (s.password && !input.password) pw = s.password;
  }
  if (c.kind === "sqlite" && !c.file && c.url) c.file = c.url.replace(/^(file|sqlite):(\/\/)?/i, "");
  const tmpKey = `db:__test__${Date.now()}`;
  const tmp = { ...c, id: tmpKey.slice(3) };
  if (pw) setSecret(ctx, tmpKey, pw);
  try {
    const d = await makeDriver(ctx, tmp);
    try {
      return await d.version();
    } finally {
      await d.close();
    }
  } finally {
    setSecret(ctx, tmpKey, null);
  }
}

export async function disconnect(id: string) {
  await closeDriver(id);
}

export const isConnected = (id: string) => drivers.has(id);

export async function schema(ctx: Ctx, id: string): Promise<DbSchema[]> {
  return (await driverFor(ctx, id)).schema();
}

const riskFor = async (kind: DbKind, text: string): Promise<string | null> => {
  if (kind === "mongodb") return (await import("./drivers/mongo")).mongoRisk(text);
  if (kind === "redis") return (await import("./drivers/redis")).redisRisk(text);
  return riskOf(text);
};

export class NeedsConfirm extends Error {
  constructor(public reason: string) {
    super(`CONFIRM:${reason}`);
  }
}

export async function query(ctx: Ctx, id: string, text: string, o: QueryOptions = {}): Promise<QueryResult> {
  const c = connection(ctx, id);
  const t = text.trim();
  if (!t) throw new Error("Query kosong.");
  if (c.readOnly && (c.kind === "postgres" || c.kind === "mysql" || c.kind === "sqlite") && isWrite(t)) throw new Error("Koneksi read-only: query yang mengubah data diblokir.");
  const risk = await riskFor(c.kind, t);
  if (risk && !o.confirmed) throw new NeedsConfirm(risk);
  const d = await driverFor(ctx, id);
  const limit = Math.max(1, Math.min(o.limit ?? 1000, 100_000));
  const timeoutMs = Math.max(1000, Math.min(o.timeoutMs ?? 60_000, 3_600_000));
  const t0 = Date.now();
  try {
    const r = await d.query(t, { limit, timeoutMs });
    pushHistory(ctx, id, { text: t, at: t0, ms: r.ms, rows: r.rows.length, ok: true });
    return r;
  } catch (e) {
    pushHistory(ctx, id, { text: t, at: t0, ms: Date.now() - t0, ok: false, error: String((e as Error).message ?? e).slice(0, 300) });
    throw e;
  }
}

export async function cancel(id: string) {
  const d = drivers.get(id);
  if (d) await (await d).cancel();
}

type Dialect = "postgres" | "mysql" | "sqlite";
const dialectOf = (c: DbConnection): Dialect => {
  if (c.kind === "postgres" || c.kind === "mysql" || c.kind === "sqlite") return c.kind;
  throw new Error("Hanya untuk database SQL.");
};
const qualified = (d: Dialect, schemaName: string | null, table: string) => (schemaName && d !== "sqlite" ? `${quoteIdent(d, schemaName)}.${quoteIdent(d, table)}` : quoteIdent(d, table));

export interface BrowseOptions {
  schema: string | null;
  table: string;
  offset?: number;
  limit?: number;
  orderBy?: string | null;
  desc?: boolean;
  /** Filter sederhana per kolom: nilai dicocokkan sebagai teks (LIKE %v%). */
  filters?: Record<string, string>;
}

/** SELECT halaman tabel (identifier dikutip, nilai filter sebagai parameter). */
export function buildBrowse(d: Dialect, o: BrowseOptions): { sql: string; params: unknown[]; countSql: string } {
  const params: unknown[] = [];
  const where = Object.entries(o.filters ?? {})
    .filter(([, v]) => v !== "")
    .map(([k, v]) => {
      params.push(`%${v}%`);
      const col = quoteIdent(d, k);
      const asText = d === "postgres" ? `${col}::text` : d === "mysql" ? `CAST(${col} AS CHAR)` : `CAST(${col} AS TEXT)`;
      return `${asText} LIKE ${placeholder(d, params.length - 1)}`;
    });
  const from = qualified(d, o.schema, o.table) + (where.length ? ` WHERE ${where.join(" AND ")}` : "");
  const order = o.orderBy ? ` ORDER BY ${quoteIdent(d, o.orderBy)} ${o.desc ? "DESC" : "ASC"}` : "";
  const limit = Math.max(1, Math.min(o.limit ?? 200, 5000));
  const offset = Math.max(0, o.offset ?? 0);
  return { sql: `SELECT * FROM ${from}${order} LIMIT ${limit} OFFSET ${offset}`, params, countSql: `SELECT COUNT(*) FROM ${from}` };
}

export async function browse(ctx: Ctx, id: string, o: BrowseOptions): Promise<QueryResult & { total: number | null }> {
  const c = connection(ctx, id);
  const d = await driverFor(ctx, id);
  if (c.kind === "mongodb") {
    const r = await d.query(`db.getCollection(${JSON.stringify(o.table)}).find({}).skip(${o.offset ?? 0}).limit(${o.limit ?? 200})`, { limit: o.limit ?? 200, timeoutMs: 30_000 });
    const n = await d.query(`db.getCollection(${JSON.stringify(o.table)}).countDocuments({})`, { limit: 1, timeoutMs: 30_000 }).catch(() => null);
    return { ...r, total: n ? Number(n.rows[0]?.[0]) : null };
  }
  if (c.kind === "redis") return { ...(await d.query(`@key ${o.table}`, { limit: o.limit ?? 500, timeoutMs: 30_000 })), total: null };
  const dialect = dialectOf(c);
  const b = buildBrowse(dialect, o);
  const r = await d.browse!(b.sql, b.params);
  const total = await d.browse!(b.countSql, b.params).then((x) => Number(x.rows[0]?.[0])).catch(() => null);
  return { ...r, total: Number.isFinite(total) ? total : null };
}

export interface RowEdit {
  schema: string | null;
  table: string;
  /** Nilai kolom PK baris yang diubah/dihapus. */
  key: Record<string, unknown>;
  /** UPDATE: kolom → nilai baru. INSERT: semua kolom yang diisi. */
  values?: Record<string, unknown>;
  op: "update" | "insert" | "delete";
}

export function buildEdit(d: Dialect, e: RowEdit): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return placeholder(d, params.length - 1);
  };
  const t = qualified(d, e.schema, e.table);
  const keyCols = Object.keys(e.key);
  if (e.op !== "insert" && !keyCols.length) throw new Error("Tabel tanpa primary key tidak bisa diedit dari grid.");
  const where = () => keyCols.map((k) => (e.key[k] === null ? `${quoteIdent(d, k)} IS NULL` : `${quoteIdent(d, k)} = ${p(e.key[k])}`)).join(" AND ");
  if (e.op === "update") {
    const sets = Object.entries(e.values ?? {}).map(([k, v]) => `${quoteIdent(d, k)} = ${p(v)}`);
    if (!sets.length) throw new Error("Tidak ada perubahan.");
    return { sql: `UPDATE ${t} SET ${sets.join(", ")} WHERE ${where()}`, params };
  }
  if (e.op === "delete") return { sql: `DELETE FROM ${t} WHERE ${where()}`, params };
  const cols = Object.keys(e.values ?? {});
  if (!cols.length) return { sql: d === "mysql" ? `INSERT INTO ${t} () VALUES ()` : `INSERT INTO ${t} DEFAULT VALUES`, params };
  return { sql: `INSERT INTO ${t} (${cols.map((k) => quoteIdent(d, k)).join(", ")}) VALUES (${cols.map((k) => p(e.values![k])).join(", ")})`, params };
}

export async function editRow(ctx: Ctx, id: string, e: RowEdit): Promise<{ affected: number }> {
  const c = connection(ctx, id);
  if (c.readOnly) throw new Error("Koneksi read-only.");
  const b = buildEdit(dialectOf(c), e);
  const r = await (await driverFor(ctx, id)).exec(b.sql, b.params);
  pushHistory(ctx, id, { text: b.sql, at: Date.now(), ms: 0, rows: r.affected, ok: true });
  if (e.op !== "insert" && r.affected > 1) throw new Error(`Peringatan: ${r.affected} baris terpengaruh (PK tidak unik?).`);
  return r;
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(r: Pick<QueryResult, "columns" | "rows">): string {
  return [r.columns.map((c) => csvCell(c.name)).join(","), ...r.rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
}

export function toJson(r: Pick<QueryResult, "columns" | "rows">): string {
  return JSON.stringify(r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c.name, row[i]]))), null, 2) + "\n";
}

/** Jalankan query lagi tanpa batas tampilan (maks 1 juta baris) dan tulis ke berkas. */
export async function exportQuery(ctx: Ctx, id: string, text: string, format: "csv" | "json", target: string): Promise<{ rows: number }> {
  const c = connection(ctx, id);
  if (isWrite(text) && c.kind !== "mongodb" && c.kind !== "redis") throw new Error("Ekspor hanya untuk query baca.");
  const r = await (await driverFor(ctx, id)).query(text, { limit: 1_000_000, timeoutMs: 600_000 });
  fs.writeFileSync(target, format === "csv" ? toCsv(r) : toJson(r));
  return { rows: r.rows.length };
}

export interface HistoryEntry {
  text: string;
  at: number;
  ms: number;
  rows?: number;
  ok: boolean;
  error?: string;
}

export function history(ctx: Ctx, id: string): HistoryEntry[] {
  try {
    return JSON.parse(fs.readFileSync(historyFile(ctx, id), "utf8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

function pushHistory(ctx: Ctx, id: string, e: HistoryEntry) {
  try {
    const list = [e, ...history(ctx, id).filter((x) => x.text !== e.text)].slice(0, 200);
    fs.mkdirSync(path.dirname(historyFile(ctx, id)), { recursive: true });
    fs.writeFileSync(historyFile(ctx, id), JSON.stringify(list));
  } catch {
    /* riwayat opsional */
  }
}

/** Skema ringkas (tanpa data) untuk prompt AI / konteks agen. */
export function schemaText(kind: DbKind, schemas: DbSchema[], max = 12_000): string {
  const lines: string[] = [`-- ${kind}`];
  for (const s of schemas) {
    for (const t of s.tables) {
      if (kind === "redis") {
        lines.push(`${t.name} (${t.detail ?? "?"})`);
        continue;
      }
      const cols = t.columns.map((c) => `${c.name} ${c.type}${c.pk ? " PK" : ""}${c.nullable ? "" : " NOT NULL"}`).join(", ");
      const fks = t.fks.map((f) => ` FK(${f.columns.join(",")})→${f.refTable}(${f.refColumns.join(",")})`).join("");
      lines.push(`${s.name ? s.name + "." : ""}${t.name}${t.kind === "view" ? " [view]" : ""}(${cols})${fks}`);
    }
    if (lines.join("\n").length > max) break;
  }
  const out = lines.join("\n");
  return out.length > max ? out.slice(0, max) + "\n-- (dipotong)" : out;
}
