// SQLite lewat `node:sqlite` bawaan Node, di worker thread supaya query panjang tidak membekukan
// main process; "batalkan" = hentikan worker lalu buka ulang.

import { Worker } from "node:worker_threads";
import type { Driver } from "../driver";
import { withTimeout } from "../driver";
import { splitStatements } from "../risk";
import type { DbSchema, QueryResult } from "../types";

// Kode worker (dijalankan apa adanya; tidak dibundel).
const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(workerData.file, { readOnly: !!workerData.readOnly });
const cell = (v) => v === null || v === undefined ? null : typeof v === "bigint" ? (v <= 9007199254740991n && v >= -9007199254740991n ? Number(v) : v.toString()) : v instanceof Uint8Array ? "\\\\x" + Buffer.from(v).subarray(0, 64).toString("hex") + (v.length > 64 ? "… (" + v.length + " B)" : "") : v;
parentPort.on("message", (m) => {
  try {
    if (m.op === "all") {
      const st = db.prepare(m.sql);
      parentPort.postMessage({ id: m.id, ok: st.all(...(m.params || [])) });
    } else if (m.op === "run") {
      const st = db.prepare(m.sql);
      const r = st.run(...(m.params || []));
      parentPort.postMessage({ id: m.id, ok: { affected: Number(r.changes) } });
    } else if (m.op === "query") {
      const t0 = Date.now();
      const st = db.prepare(m.sql);
      const cols = typeof st.columns === "function" ? st.columns() : [];
      st.setReadBigInts(true);
      if (cols.length) {
        st.setReturnArrays?.(true);
        const rows = []; let truncated = false;
        for (const r of st.iterate(...(m.params || []))) {
          if (rows.length >= m.limit) { truncated = true; break; }
          rows.push((Array.isArray(r) ? r : Object.values(r)).map(cell));
        }
        parentPort.postMessage({ id: m.id, ok: { columns: cols.map((c) => ({ name: c.name, type: c.type || undefined })), rows, truncated, ms: Date.now() - t0 } });
      } else {
        const r = st.run(...(m.params || []));
        parentPort.postMessage({ id: m.id, ok: { columns: [], rows: [], truncated: false, affected: Number(r.changes), ms: Date.now() - t0, message: "OK" } });
      }
    }
  } catch (e) { parentPort.postMessage({ id: m.id, err: String(e && e.message || e) }); }
});
`;

export async function sqliteDriver(file: string, readOnly: boolean): Promise<Driver> {
  let worker: Worker;
  let seq = 0;
  const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  const spawn = () => {
    worker = new Worker(WORKER, { eval: true, workerData: { file, readOnly } });
    worker.on("message", (m: { id: number; ok?: unknown; err?: string }) => {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.err) p?.rej(new Error(m.err));
      else p?.res(m.ok);
    });
    worker.on("error", (e: Error) => {
      for (const p of pending.values()) p.rej(e);
      pending.clear();
    });
  };
  spawn();
  const call = <T>(msg: Record<string, unknown>) =>
    new Promise<T>((res, rej) => {
      const id = ++seq;
      pending.set(id, { res: res as (v: unknown) => void, rej });
      worker.postMessage({ ...msg, id });
    });
  const cancel = async () => {
    for (const p of pending.values()) p.rej(new Error("Query dibatalkan."));
    pending.clear();
    // Langkah SQLite yang sedang berjalan di kode native tidak bisa diinterupsi: worker lama dihentikan
    // (selesai begitu kembali ke JS) dan worker baru langsung dipakai.
    void worker.terminate();
    spawn();
  };
  // Buka gagal (berkas bukan SQLite) terdeteksi di sini.
  await call({ op: "all", sql: "SELECT sqlite_version() AS v" });

  return {
    async version() {
      const r = await call<{ v: string }[]>({ op: "all", sql: "SELECT sqlite_version() AS v" });
      return `SQLite ${r[0].v}`;
    },
    async schema() {
      const objs = await call<{ name: string; type: string }[]>({ op: "all", sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name" });
      const tables: DbSchema["tables"] = [];
      for (const o of objs.slice(0, 2000)) {
        const q = o.name.replace(/"/g, '""');
        const [cols, fks] = await Promise.all([
          call<{ name: string; type: string; notnull: number; pk: number; dflt_value: string | null }[]>({ op: "all", sql: `PRAGMA table_info("${q}")` }),
          call<{ id: number; table: string; from: string; to: string }[]>({ op: "all", sql: `PRAGMA foreign_key_list("${q}")` }),
        ]);
        const byId = new Map<number, typeof fks>();
        for (const f of fks) byId.set(f.id, [...(byId.get(f.id) ?? []), f]);
        tables.push({ name: o.name, kind: o.type === "view" ? "view" : "table", columns: cols.map((c) => ({ name: c.name, type: c.type, nullable: !c.notnull, pk: c.pk > 0, default: c.dflt_value })), fks: [...byId.values()].map((g) => ({ columns: g.map((x) => x.from), refSchema: null, refTable: g[0].table, refColumns: g.map((x) => x.to) })) });
      }
      return [{ name: "main", tables }];
    },
    async query(text, o) {
      const stmts = splitStatements(text);
      if (!stmts.length) return { columns: [], rows: [], truncated: false, ms: 0, message: "Tidak ada statement." };
      let last: QueryResult | null = null;
      for (const s of stmts) last = await withTimeout(call<QueryResult>({ op: "query", sql: s, limit: o.limit }), o.timeoutMs, cancel);
      return last!;
    },
    async browse(sql, params) {
      return call<QueryResult>({ op: "query", sql, params, limit: 100_000 });
    },
    async exec(sql, params) {
      return call<{ affected: number }>({ op: "run", sql, params });
    },
    cancel,
    async close() {
      await worker.terminate();
    },
  };
}
