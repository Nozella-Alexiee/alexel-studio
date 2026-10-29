// Redis lewat ioredis. "Skema" = hasil SCAN (maks 2000 key) dikelompokkan per prefix `a:b:`; query = baris
// perintah gaya redis-cli (`GET user:1`, `HGETALL k`, `SCAN 0 MATCH x* COUNT 100`). Perintah tulis/berbahaya
// diblokir di mode read-only.

import type { Redis } from "ioredis";
import type { Driver } from "../driver";
import { cell, withTimeout } from "../driver";
import type { DbSchema, DbTable, QueryResult } from "../types";

const READ = new Set("GET MGET STRLEN GETRANGE EXISTS TYPE TTL PTTL KEYS SCAN HGET HGETALL HKEYS HVALS HLEN HMGET HSCAN LRANGE LLEN LINDEX SMEMBERS SCARD SISMEMBER SSCAN ZRANGE ZREVRANGE ZRANGEBYSCORE ZCARD ZSCORE ZSCAN XRANGE XREVRANGE XLEN XINFO INFO DBSIZE PING ECHO TIME OBJECT MEMORY JSON.GET PUBSUB CLIENT CONFIG".split(" "));
const DANGER = /^(FLUSHALL|FLUSHDB|SHUTDOWN|DEBUG|MIGRATE|SWAPDB|CONFIG SET|CLIENT KILL|SCRIPT FLUSH)/i;

/** Pecah baris perintah redis-cli (kutip "…" / '…' didukung). */
export function splitRedis(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3]);
  return out;
}

export function redisRisk(text: string): string | null {
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (DANGER.test(l)) return "Perintah ini mengubah atau menghapus seluruh server/database Redis.";
    if (/^(DEL|UNLINK)\s/i.test(l) && /[*?[]/.test(l)) return "DEL dengan pola tidak didukung; hapus key satu per satu.";
  }
  return null;
}

const isRead = (args: string[]) => {
  const c = args[0]?.toUpperCase() ?? "";
  if (c === "CONFIG") return args[1]?.toUpperCase() === "GET";
  if (c === "CLIENT") return ["LIST", "INFO", "GETNAME"].includes(args[1]?.toUpperCase() ?? "");
  return READ.has(c);
};

function flatten(v: unknown, depth = 0): unknown[][] {
  if (!Array.isArray(v)) return [[cell(v)]];
  if (depth === 0 && v.length === 2 && typeof v[0] === "string" && Array.isArray(v[1])) return (v[1] as unknown[]).map((x) => [cell(x)]);
  return v.map((x) => [Array.isArray(x) ? JSON.stringify(x) : cell(x)]);
}

export async function redisDriver(url: string, db: number | undefined, readOnly: boolean): Promise<Driver> {
  const { default: IORedis } = await import("ioredis");
  const client: Redis = new IORedis(url, { lazyConnect: true, connectTimeout: 10_000, maxRetriesPerRequest: 1, db, enableOfflineQueue: false, connectionName: "alexel-studio" });
  await client.connect();

  const keyValue = async (key: string, limit: number): Promise<QueryResult> => {
    const t0 = Date.now();
    const type = await client.type(key);
    const ttl = await client.ttl(key);
    const message = `${type}${ttl >= 0 ? ` · TTL ${ttl}s` : ""}`;
    const done = (columns: string[], rows: unknown[][], total?: number): QueryResult => ({ columns: columns.map((name) => ({ name })), rows: rows.slice(0, limit), truncated: (total ?? rows.length) > limit, ms: Date.now() - t0, message });
    switch (type) {
      case "string":
        return done(["value"], [[await client.get(key)]]);
      case "hash": {
        const h = await client.hgetall(key);
        return done(["field", "value"], Object.entries(h));
      }
      case "list":
        return done(["index", "value"], (await client.lrange(key, 0, limit)).map((v, i) => [i, v]), await client.llen(key));
      case "set":
        return done(["member"], (await client.sscan(key, 0, "COUNT", limit))[1].map((v) => [v]), await client.scard(key));
      case "zset": {
        const z = await client.zrange(key, 0, limit, "WITHSCORES");
        const rows: unknown[][] = [];
        for (let i = 0; i < z.length; i += 2) rows.push([z[i], z[i + 1]]);
        return done(["member", "score"], rows, await client.zcard(key));
      }
      case "stream": {
        const s = (await client.xrange(key, "-", "+", "COUNT", limit + 1)) as [string, string[]][];
        return done(["id", "fields"], s.map(([id, f]) => [id, JSON.stringify(Object.fromEntries(f.flatMap((_, i) => (i % 2 ? [] : [[f[i], f[i + 1]]]))))]));
      }
      case "none":
        throw new Error(`Key ${key} tidak ada.`);
      default:
        return done(["value"], [[`(tipe ${type})`]]);
    }
  };

  const run = async (text: string, limit: number): Promise<QueryResult> => {
    const t0 = Date.now();
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));
    if (!lines.length) throw new Error("Tidak ada perintah.");
    if (lines.length === 1 && /^@key\s+/.test(lines[0])) return keyValue(lines[0].replace(/^@key\s+/, ""), limit);
    let last: QueryResult | null = null;
    for (const line of lines) {
      const args = splitRedis(line);
      if (readOnly && !isRead(args)) throw new Error(`Koneksi read-only: ${args[0]} diblokir.`);
      const r = await client.call(args[0], ...args.slice(1));
      const rows = flatten(r);
      last = { columns: [{ name: args[0].toUpperCase() }], rows: rows.slice(0, limit), truncated: rows.length > limit, ms: Date.now() - t0 };
      if (typeof r === "string" && r.includes("\n") && args[0].toUpperCase() === "INFO") {
        const kv = r.split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split(":"));
        last = { columns: [{ name: "key" }, { name: "value" }], rows: kv.map(([k, ...v]) => [k, v.join(":")]), truncated: false, ms: Date.now() - t0 };
      }
    }
    return last!;
  };

  return {
    async version() {
      const info = await client.info("server");
      return `Redis ${/redis_version:(\S+)/.exec(info)?.[1] ?? ""}`.trim();
    },
    async schema() {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await client.scan(cursor, "COUNT", 500);
        keys.push(...batch);
        cursor = next;
      } while (cursor !== "0" && keys.length < 2000);
      const pipe = client.pipeline();
      for (const k of keys) pipe.type(k);
      const types = ((await pipe.exec()) ?? []).map((r) => String(r[1]));
      const groups = new Map<string, DbTable[]>();
      keys.forEach((k, i) => {
        const prefix = k.includes(":") ? k.slice(0, k.lastIndexOf(":") + 1) : "";
        const arr = groups.get(prefix) ?? [];
        arr.push({ name: k, kind: "key", detail: types[i], columns: [], fks: [] });
        groups.set(prefix, arr);
      });
      return [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, tables]) => ({ name, tables: tables.sort((a, b) => a.name.localeCompare(b.name)) })) as DbSchema[];
    },
    async query(text, o) {
      return withTimeout(run(text, o.limit), o.timeoutMs, () => {});
    },
    async exec() {
      throw new Error("Tidak didukung untuk Redis.");
    },
    async cancel() {},
    async close() {
      client.disconnect();
    },
  };
}
