// MongoDB lewat driver resmi. Query bergaya shell: db.koleksi.find({...}).sort({...}).limit(n),
// aggregate([...]), countDocuments, distinct, insertOne/Many, updateOne/Many, deleteOne/Many,
// db.runCommand({...}). Nilai diurai sebagai EJSON (ObjectId, tanggal) tanpa eval.

import type { Document, MongoClient } from "mongodb";
import type { Driver } from "../driver";
import { cell, withTimeout } from "../driver";
import { looseToJson, splitArgs } from "../loose";
import type { DbSchema, QueryResult } from "../types";

const WRITE = /^(insert|update|delete|replace|drop|bulkWrite|createIndex|dropIndex|rename|findOneAnd)/;

export interface MongoCommand {
  coll: string | null;
  method: string;
  args: string[];
  chain: { method: string; args: string[] }[];
}

/** Urai `db.users.find({a:1}).limit(5)` (tanpa eval). */
export function parseMongo(text: string): MongoCommand {
  const t = text.trim().replace(/;\s*$/, "");
  const m = /^db\.(?:getCollection\(\s*(["'])(.+?)\1\s*\)|([\w$-]+(?:\.[\w$-]+)*?))\.(\w+)\(/.exec(t);
  const rc = /^db\.(runCommand|adminCommand)\(/.exec(t);
  if (!m && !rc) throw new Error("Format: db.<koleksi>.find({...}) / aggregate([...]) / db.runCommand({...})");
  let i = (m ?? rc)![0].length;
  const readCall = (): string => {
    let depth = 1;
    let q: string | null = null;
    const start = i;
    for (; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === "\\") i++;
        else if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") q = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
    }
    const inner = t.slice(start, i);
    i++;
    return inner;
  };
  const first = readCall();
  const chain: MongoCommand["chain"] = [];
  while (i < t.length) {
    const cm = /^\s*\.(\w+)\(/.exec(t.slice(i));
    if (!cm) break;
    i += cm[0].length;
    chain.push({ method: cm[1], args: splitArgs(readCall()) });
  }
  if (rc) return { coll: null, method: rc[1], args: splitArgs(first), chain };
  return { coll: m![2] ?? m![3], method: m![4], args: splitArgs(first), chain };
}

export function mongoRisk(text: string): string | null {
  try {
    const c = parseMongo(text);
    if (/^drop/.test(c.method)) return "drop menghapus koleksi/database secara permanen.";
    if (/^(deleteMany|updateMany)$/.test(c.method) && (!c.args[0] || /^\{\s*\}$/.test(c.args[0]))) return "Filter kosong mengenai semua dokumen di koleksi.";
  } catch {
    /* format salah: ditolak saat dijalankan */
  }
  return null;
}

export async function mongoDriver(url: string, database: string | undefined, readOnly: boolean): Promise<Driver> {
  const { MongoClient, BSON } = await import("mongodb");
  const client: MongoClient = new MongoClient(url, { serverSelectionTimeoutMS: 10_000, appName: "Alexel Studio" });
  await client.connect();
  const db = client.db(database || undefined);
  const parse = (s: string | undefined): Document => (s ? (BSON.EJSON.parse(looseToJson(s), { relaxed: true }) as Document) : {});
  const toRows = (docs: Document[], limit: number, t0: number): QueryResult => {
    const keys: string[] = [];
    for (const d of docs.slice(0, 200)) for (const k of Object.keys(d)) if (!keys.includes(k)) keys.push(k);
    const plain = docs.slice(0, limit).map((d) => BSON.EJSON.serialize(d, { relaxed: true }) as Record<string, unknown>);
    return { columns: keys.map((name) => ({ name })), rows: plain.map((d) => keys.map((k) => (k === "_id" && d[k] && typeof d[k] === "object" && "$oid" in (d[k] as object) ? (d[k] as { $oid: string }).$oid : cell(d[k])))), truncated: docs.length > limit, ms: Date.now() - t0 };
  };

  const run = async (text: string, limit: number): Promise<QueryResult> => {
    const t0 = Date.now();
    const c = parseMongo(text);
    if (readOnly && (WRITE.test(c.method) || c.method === "runCommand" || c.method === "adminCommand")) throw new Error("Koneksi read-only: perintah tulis diblokir.");
    if (c.coll === null) {
      const r = c.method === "adminCommand" ? await client.db("admin").command(parse(c.args[0])) : await db.command(parse(c.args[0]));
      return toRows([r], limit, t0);
    }
    const col = db.collection(c.coll);
    switch (c.method) {
      case "find": {
        let cur = col.find(parse(c.args[0]), c.args[1] ? { projection: parse(c.args[1]) } : {});
        let lim = limit + 1;
        for (const ch of c.chain) {
          if (ch.method === "sort") cur = cur.sort(parse(ch.args[0]) as never);
          else if (ch.method === "skip") cur = cur.skip(Number(ch.args[0]) || 0);
          else if (ch.method === "limit") lim = Math.min(lim, (Number(ch.args[0]) || limit) + 1);
          else if (ch.method === "project") cur = cur.project(parse(ch.args[0]));
        }
        return toRows(await cur.limit(lim).toArray(), Math.min(limit, lim - 1), t0);
      }
      case "findOne":
        return toRows([(await col.findOne(parse(c.args[0]))) ?? {}].filter((d) => Object.keys(d).length), limit, t0);
      case "aggregate": {
        const pipeline = (BSON.EJSON.parse(looseToJson(c.args[0] || "[]"), { relaxed: true }) as Document[]) ?? [];
        return toRows(await col.aggregate([...pipeline, { $limit: limit + 1 }]).toArray(), limit, t0);
      }
      case "countDocuments":
      case "count":
        return { columns: [{ name: "count" }], rows: [[await col.countDocuments(parse(c.args[0]))]], truncated: false, ms: Date.now() - t0 };
      case "distinct": {
        const vals = await col.distinct(JSON.parse(looseToJson(c.args[0])), parse(c.args[1]));
        return { columns: [{ name: "value" }], rows: vals.slice(0, limit).map((v) => [cell(v)]), truncated: vals.length > limit, ms: Date.now() - t0 };
      }
      case "insertOne":
        return msg(`Disisipkan: ${String((await col.insertOne(parse(c.args[0]))).insertedId)}`, 1, t0);
      case "insertMany": {
        const docs = BSON.EJSON.parse(looseToJson(c.args[0] || "[]"), { relaxed: true }) as Document[];
        return msg("Disisipkan", (await col.insertMany(docs)).insertedCount, t0);
      }
      case "updateOne":
      case "updateMany": {
        const r = c.method === "updateOne" ? await col.updateOne(parse(c.args[0]), parse(c.args[1])) : await col.updateMany(parse(c.args[0]), parse(c.args[1]));
        return msg(`Cocok ${r.matchedCount}, diubah`, r.modifiedCount, t0);
      }
      case "deleteOne":
      case "deleteMany": {
        const r = c.method === "deleteOne" ? await col.deleteOne(parse(c.args[0])) : await col.deleteMany(parse(c.args[0]));
        return msg("Dihapus", r.deletedCount, t0);
      }
      case "drop":
        await col.drop();
        return msg(`Koleksi ${c.coll} dihapus`, null, t0);
      default:
        throw new Error(`Metode ${c.method} belum didukung.`);
    }
  };
  const msg = (message: string, affected: number | null, t0: number): QueryResult => ({ columns: [], rows: [], truncated: false, affected, ms: Date.now() - t0, message });

  return {
    async version() {
      const info = await db.admin().serverInfo().catch(() => null);
      return `MongoDB ${info?.version ?? ""}`.trim();
    },
    async schema() {
      const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).slice(0, 500);
      const tables = await Promise.all(
        cols.map(async (c) => {
          const sample = await db.collection(c.name).find({}).limit(20).toArray().catch(() => [] as Document[]);
          const fields = new Map<string, string>();
          for (const d of sample) for (const [k, v] of Object.entries(d)) if (!fields.has(k)) fields.set(k, v === null ? "null" : Array.isArray(v) ? "array" : v instanceof Date ? "date" : typeof v === "object" ? (v as { _bsontype?: string })._bsontype ?? "object" : typeof v);
          const count = await db.collection(c.name).estimatedDocumentCount().catch(() => null);
          return { name: c.name, kind: "collection" as const, detail: count === null ? undefined : String(count), columns: [...fields].map(([name, type]) => ({ name, type, nullable: true, pk: name === "_id" })), fks: [] };
        })
      );
      return [{ name: db.databaseName, tables: tables.sort((a, b) => a.name.localeCompare(b.name)) }] as DbSchema[];
    },
    async query(text, o) {
      return withTimeout(run(text, o.limit), o.timeoutMs, () => {});
    },
    async exec() {
      throw new Error("Tidak didukung untuk MongoDB.");
    },
    async cancel() {},
    async close() {
      await client.close().catch(() => {});
    },
  };
}
