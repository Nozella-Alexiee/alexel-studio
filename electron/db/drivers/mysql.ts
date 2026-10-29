// MySQL / MariaDB lewat `mysql2` (API callback untuk streaming baris dengan batas).

import type { Connection, ConnectionOptions, FieldPacket } from "mysql2";
import type { Driver } from "../driver";
import { cell, withTimeout } from "../driver";
import { splitStatements } from "../risk";
import type { DbSchema, QueryResult } from "../types";
import { buildSchema } from "./postgres";

let TYPE_NAMES: Record<number, string> = {};
const typeName = (f: FieldPacket) => {
  const t = (f as { columnType?: number }).columnType;
  return t === undefined ? undefined : (TYPE_NAMES[t]?.toLowerCase() ?? String(t));
};

export async function mysqlDriver(config: ConnectionOptions, readOnly: boolean): Promise<Driver> {
  const mysql = await import("mysql2");
  TYPE_NAMES = Object.fromEntries(Object.entries((mysql as unknown as { Types: Record<string, number> }).Types ?? {}).map(([k, v]) => [v, k]));
  const conn: Connection = mysql.createConnection({ ...config, connectTimeout: 10_000, multipleStatements: false, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  const p = <T = unknown>(sql: string, params: unknown[] = []) => new Promise<T>((res, rej) => conn.query(sql, params, (e, r) => (e ? rej(e) : res(r as T))));
  await new Promise<void>((res, rej) => conn.connect((e) => (e ? rej(e) : res())));
  if (readOnly) await p("SET SESSION TRANSACTION READ ONLY");
  let busy = false;

  const cancel = async () => {
    if (!busy) return;
    const c2 = mysql.createConnection({ ...config, connectTimeout: 5000 });
    await new Promise<void>((res) => c2.query(`KILL QUERY ${Number(conn.threadId)}`, () => res()));
    c2.end();
  };

  const runOne = (sql: string, limit: number) =>
    new Promise<QueryResult>((resolve, reject) => {
      const t0 = Date.now();
      const rows: unknown[][] = [];
      let fields: FieldPacket[] = [];
      let truncated = false;
      let affected: number | null = null;
      let message: string | undefined;
      const q = conn.query({ sql, rowsAsArray: true });
      q.on("fields", (f: FieldPacket[] | undefined) => (fields = f ?? []));
      q.on("result", (r: unknown) => {
        if (Array.isArray(r)) {
          if (rows.length < limit) rows.push(r.map(cell));
          else truncated = true;
        } else {
          const h = r as { affectedRows?: number; info?: string };
          affected = h.affectedRows ?? null;
          message = h.info || "OK";
        }
      });
      q.on("error", reject);
      q.on("end", () => resolve({ columns: fields.map((f) => ({ name: f.name, type: typeName(f) })), rows, truncated, affected, ms: Date.now() - t0, message }));
    });

  return {
    async version() {
      const r = await p<{ v: string }[]>("SELECT VERSION() AS v");
      return String(r[0].v);
    },
    async schema() {
      const skip = "table_schema NOT IN ('mysql','information_schema','performance_schema','sys')";
      const db = config.database ? `table_schema = ${mysql.escape(config.database)}` : skip;
      const [tables, cols, fks] = await Promise.all([
        p<Record<string, string>[]>(`SELECT table_schema s, table_name t, table_type k FROM information_schema.tables WHERE ${db} ORDER BY 1,2 LIMIT 5000`),
        p<Record<string, string>[]>(`SELECT table_schema s, table_name t, column_name c, column_type d, is_nullable n, column_default df, column_key ck FROM information_schema.columns WHERE ${db} ORDER BY table_schema, table_name, ordinal_position`),
        p<Record<string, string>[]>(`SELECT constraint_name nm, table_schema s, table_name t, column_name c, referenced_table_schema rs, referenced_table_name rt, referenced_column_name rc FROM information_schema.key_column_usage WHERE ${db} AND referenced_table_name IS NOT NULL ORDER BY constraint_name, ordinal_position`),
      ]);
      const pks = cols.filter((c) => c.ck === "PRI").map((c) => ({ s: c.s, t: c.t, c: c.c }));
      return buildSchema(tables, cols, pks, fks) as DbSchema[];
    },
    async query(text, o) {
      const stmts = splitStatements(text);
      if (!stmts.length) return { columns: [], rows: [], truncated: false, ms: 0, message: "Tidak ada statement." };
      busy = true;
      try {
        let last: QueryResult | null = null;
        for (const s of stmts) last = await withTimeout(runOne(s, o.limit), o.timeoutMs, cancel);
        return last!;
      } finally {
        busy = false;
      }
    },
    async browse(sql, params) {
      const t0 = Date.now();
      return new Promise<QueryResult>((res, rej) =>
        conn.query({ sql, rowsAsArray: true, values: params }, (e, rows, fields) => (e ? rej(e) : res({ columns: (fields ?? []).map((f) => ({ name: f.name, type: typeName(f) })), rows: (rows as unknown[][]).map((r) => r.map(cell)), truncated: false, ms: Date.now() - t0 })))
      );
    },
    async exec(sql, params) {
      const r = await p<{ affectedRows?: number }>(sql, params);
      return { affected: r.affectedRows ?? 0 };
    },
    cancel,
    async close() {
      await new Promise<void>((res) => conn.end(() => res()));
    },
  };
}
