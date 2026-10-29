// PostgreSQL lewat `pg` (+ pg-cursor untuk membatasi baris tanpa memuat seluruh hasil).

import type { Client as PgClient, ClientConfig } from "pg";
import type { Driver } from "../driver";
import { cell, withTimeout } from "../driver";
import { isReadQuery, splitStatements } from "../risk";
import type { DbSchema, QueryResult } from "../types";

// OID tipe umum → nama (selebihnya ditampilkan sebagai angka OID).
const TYPES: Record<number, string> = { 16: "bool", 17: "bytea", 20: "int8", 21: "int2", 23: "int4", 25: "text", 114: "json", 700: "float4", 701: "float8", 1042: "char", 1043: "varchar", 1082: "date", 1083: "time", 1114: "timestamp", 1184: "timestamptz", 1700: "numeric", 2950: "uuid", 3802: "jsonb" };

export async function postgresDriver(config: ClientConfig, readOnly: boolean): Promise<Driver> {
  const pg = await import("pg");
  const { Client } = pg;
  const Cursor = (await import("pg-cursor")).default;
  // Tanggal & angka besar dikembalikan sebagai teks apa adanya (tidak digeser zona waktu / presisi).
  const types = { getTypeParser: (oid: number, format?: string) => (oid === 1082 || oid === 1114 || oid === 1184 || oid === 20 || oid === 1700 ? (v: string) => v : (pg.types.getTypeParser(oid, format as never) as (v: string) => unknown)) };
  const client: PgClient = new Client({ ...config, types, connectionTimeoutMillis: 10_000, application_name: "Alexel Studio" } as ClientConfig);
  await client.connect();
  if (readOnly) await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  let busy = false;

  const cancel = async () => {
    const pid = (client as unknown as { processID?: number }).processID;
    if (!pid || !busy) return;
    const c2 = new Client({ ...config, connectionTimeoutMillis: 5000 } as ClientConfig);
    try {
      await c2.connect();
      await c2.query("SELECT pg_cancel_backend($1)", [pid]);
    } finally {
      await c2.end().catch(() => {});
    }
  };

  const runOne = async (sql: string, limit: number): Promise<QueryResult> => {
    const t0 = Date.now();
    if (isReadQuery(sql)) {
      const cursor = client.query(new Cursor(sql, [], { rowMode: "array" }));
      const rows: unknown[][] = await new Promise((res, rej) => cursor.read(limit + 1, (e: Error | undefined, r: unknown[][]) => (e ? rej(e) : res(r))));
      const fields = ((cursor as unknown as { _result?: { fields?: { name: string; dataTypeID: number }[] } })._result?.fields ?? []);
      await new Promise<void>((res) => cursor.close(() => res()));
      return { columns: fields.map((f) => ({ name: f.name, type: TYPES[f.dataTypeID] ?? String(f.dataTypeID) })), rows: rows.slice(0, limit).map((r) => r.map(cell)), truncated: rows.length > limit, ms: Date.now() - t0 };
    }
    const r = await client.query({ text: sql, rowMode: "array" });
    const res = Array.isArray(r) ? r[r.length - 1] : r;
    return { columns: (res.fields ?? []).map((f: { name: string; dataTypeID: number }) => ({ name: f.name, type: TYPES[f.dataTypeID] })), rows: (res.rows ?? []).slice(0, limit).map((x: unknown[]) => x.map(cell)), affected: res.rowCount, truncated: (res.rows?.length ?? 0) > limit, ms: Date.now() - t0, message: res.command };
  };

  const d: Driver = {
    async version() {
      return String((await client.query("SELECT version() AS v")).rows[0].v);
    },
    async schema() {
      const skip = "table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_toast%' AND table_schema NOT LIKE 'pg_temp%'";
      // Berurutan: satu Client pg tidak boleh menjalankan beberapa query bersamaan.
      const run = async (qs: string[]) => {
        const out = [];
        for (const q of qs) out.push(await client.query(q));
        return out;
      };
      const [tables, cols, pks, fks] = await run([
        `SELECT table_schema s, table_name t, table_type k FROM information_schema.tables WHERE ${skip} ORDER BY 1,2 LIMIT 5000`,
        `SELECT table_schema s, table_name t, column_name c, data_type d, is_nullable n, column_default df FROM information_schema.columns WHERE ${skip} ORDER BY table_schema, table_name, ordinal_position`,
        `SELECT tc.table_schema s, tc.table_name t, kcu.column_name c FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name WHERE tc.constraint_type = 'PRIMARY KEY'`,
        `SELECT con.conname nm, n.nspname s, c.relname t, a.attname c, nr.nspname rs, cr.relname rt, ar.attname rc
          FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_class cr ON cr.oid = con.confrelid JOIN pg_namespace nr ON nr.oid = cr.relnamespace
          CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, refattnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
          JOIN pg_attribute ar ON ar.attrelid = con.confrelid AND ar.attnum = k.refattnum
          WHERE con.contype = 'f' ORDER BY con.conname, k.ord`,
      ]);
      return buildSchema(tables.rows, cols.rows, pks.rows, fks.rows);
    },
    async query(text, o) {
      const stmts = splitStatements(text);
      if (!stmts.length) return { columns: [], rows: [], truncated: false, ms: 0, message: "Tidak ada statement." };
      busy = true;
      try {
        await client.query(`SET statement_timeout = ${Math.max(1000, Math.round(o.timeoutMs))}`);
        let last: QueryResult | null = null;
        for (const s of stmts) last = await withTimeout(runOne(s, o.limit), o.timeoutMs + 2000, cancel);
        return last!;
      } finally {
        busy = false;
      }
    },
    async browse(sql, params) {
      const t0 = Date.now();
      const r = await client.query({ text: sql, values: params, rowMode: "array" });
      return { columns: r.fields.map((f) => ({ name: f.name, type: TYPES[f.dataTypeID] ?? String(f.dataTypeID) })), rows: (r.rows as unknown[][]).map((x) => x.map(cell)), truncated: false, ms: Date.now() - t0 };
    },
    async exec(sql, params) {
      const r = await client.query(sql, params as unknown[]);
      return { affected: r.rowCount ?? 0 };
    },
    cancel,
    async close() {
      await client.end().catch(() => {});
    },
  };
  // Satu Client pg menjalankan satu query sekaligus: panggilan dari UI (skema, tabel, konsol) diantrekan.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
  return {
    ...d,
    version: () => serial(() => d.version()),
    schema: () => serial(() => d.schema()),
    query: (t, o) => serial(() => d.query(t, o)),
    browse: (sql, params) => serial(() => d.browse!(sql, params)),
    exec: (sql, params) => serial(() => d.exec(sql, params)),
  };
}

type Row = Record<string, string>;
/** Hasil information_schema (pg/mysql) → DbSchema[]. */
export function buildSchema(tables: Row[], cols: Row[], pks: Row[], fks: Row[]): DbSchema[] {
  const key = (s: string, t: string) => `${s}\u0000${t}`;
  const pk = new Set(pks.map((p) => `${key(p.s, p.t)}\u0000${p.c}`));
  const bySchema = new Map<string, DbSchema>();
  const byTable = new Map<string, DbSchema["tables"][number]>();
  for (const r of tables) {
    let s = bySchema.get(r.s);
    if (!s) bySchema.set(r.s, (s = { name: r.s, tables: [] }));
    const t = { name: r.t, kind: /VIEW/i.test(r.k) ? ("view" as const) : ("table" as const), columns: [], fks: [] };
    s.tables.push(t);
    byTable.set(key(r.s, r.t), t);
  }
  for (const c of cols) byTable.get(key(c.s, c.t))?.columns.push({ name: c.c, type: c.d, nullable: c.n === "YES", pk: pk.has(`${key(c.s, c.t)}\u0000${c.c}`), default: c.df ?? null });
  const grouped = new Map<string, Row[]>();
  for (const f of fks) grouped.set(`${f.s}.${f.t}.${f.nm}`, [...(grouped.get(`${f.s}.${f.t}.${f.nm}`) ?? []), f]);
  for (const g of grouped.values()) byTable.get(key(g[0].s, g[0].t))?.fks.push({ columns: g.map((x) => x.c), refSchema: g[0].rs ?? null, refTable: g[0].rt, refColumns: g.map((x) => x.rc) });
  return [...bySchema.values()];
}
