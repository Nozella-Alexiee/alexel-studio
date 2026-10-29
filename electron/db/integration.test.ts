// Uji integrasi ke server sungguhan. Jalan hanya bila URL diberikan, mis.:
//   ALEXEL_IT_PG=postgresql://postgres:pw@localhost:55432/shop ALEXEL_IT_MYSQL=mysql://root:pw@localhost:53306/shop \
//   ALEXEL_IT_MONGO=mongodb://localhost:57017/shop ALEXEL_IT_REDIS=redis://localhost:56379 npx vitest run electron/db/integration
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Ctx } from "../util";
import * as DB from "./index";

const ctx = { userData: fs.mkdtempSync(path.join(os.tmpdir(), "alexel-it-")) } as unknown as Ctx;
afterAll(() => DB.closeAll());
const env = process.env;

describe.skipIf(!env.ALEXEL_IT_PG)("PostgreSQL", () => {
  let id = "";
  it("sambung, buat tabel, skema, query, edit", async () => {
    expect(await DB.testConnection(ctx, { kind: "postgres", url: env.ALEXEL_IT_PG })).toMatch(/PostgreSQL 1\d/);
    id = DB.saveConnection(ctx, { kind: "postgres", url: env.ALEXEL_IT_PG }).id;
    await DB.query(ctx, id, "DROP TABLE IF EXISTS orders, users", { confirmed: true });
    await DB.query(ctx, id, "CREATE TABLE users(id serial PRIMARY KEY, name text NOT NULL, born date, big bigint, amount numeric(10,2)); CREATE TABLE orders(id serial PRIMARY KEY, user_id int REFERENCES users(id), meta jsonb)");
    await DB.query(ctx, id, "INSERT INTO users(name, born, big, amount) VALUES ('Nozi','2020-02-29', 9007199254740993, 12.50), ('Pingu', NULL, 1, 0); INSERT INTO orders(user_id, meta) VALUES (1, '{\"a\":1}')");
    const s = await DB.schema(ctx, id);
    const pub = s.find((x) => x.name === "public")!;
    expect(pub.tables.find((t) => t.name === "orders")!.fks[0]).toMatchObject({ columns: ["user_id"], refTable: "users", refColumns: ["id"] });
    const r = await DB.query(ctx, id, "SELECT * FROM users ORDER BY id", { limit: 1 });
    expect(r.columns.map((c) => c.name)).toEqual(["id", "name", "born", "big", "amount"]);
    expect(r.rows[0]).toEqual([1, "Nozi", "2020-02-29", "9007199254740993", "12.50"]);
    expect(r.truncated).toBe(true);
    const meta = await DB.query(ctx, id, "SELECT meta FROM orders");
    expect(meta.rows[0][0]).toBe('{"a":1}');
    await DB.editRow(ctx, id, { schema: "public", table: "users", key: { id: 2 }, values: { name: "Pingu 2" }, op: "update" });
    const b = await DB.browse(ctx, id, { schema: "public", table: "users", orderBy: "id", filters: { name: "2" } });
    expect(b.total).toBe(1);
    expect(b.rows[0][1]).toBe("Pingu 2");
  });
  it("batal & batas waktu", async () => {
    const slow = DB.query(ctx, id, "SELECT pg_sleep(20)");
    setTimeout(() => void DB.cancel(id), 500);
    await expect(slow).rejects.toThrow(/cancel/i);
    await expect(DB.query(ctx, id, "SELECT pg_sleep(5)", { timeoutMs: 1000 })).rejects.toThrow(/timeout|batas waktu/i);
    expect((await DB.query(ctx, id, "SELECT 1 AS x")).rows).toEqual([[1]]);
  });
  it("read-only ditegakkan server", async () => {
    const ro = DB.saveConnection(ctx, { kind: "postgres", url: env.ALEXEL_IT_PG, readOnly: true });
    await expect(DB.query(ctx, ro.id, "WITH x AS (SELECT 1) SELECT * FROM x")).resolves.toBeTruthy();
    // Lolos pemeriksaan teks (fungsi), tetap ditolak transaksi READ ONLY di server.
    await expect(DB.query(ctx, ro.id, "SELECT nextval('users_id_seq')")).rejects.toThrow(/read-only/i);
  });
});

describe.skipIf(!env.ALEXEL_IT_MYSQL)("MySQL", () => {
  it("sambung, skema, query, edit, batal", async () => {
    expect(await DB.testConnection(ctx, { kind: "mysql", url: env.ALEXEL_IT_MYSQL })).toMatch(/^8\./);
    const id = DB.saveConnection(ctx, { kind: "mysql", url: env.ALEXEL_IT_MYSQL }).id;
    await DB.query(ctx, id, "DROP TABLE IF EXISTS orders; DROP TABLE IF EXISTS users", { confirmed: true });
    await DB.query(ctx, id, "CREATE TABLE users(id int AUTO_INCREMENT PRIMARY KEY, name varchar(50) NOT NULL, born date, big bigint); CREATE TABLE orders(id int AUTO_INCREMENT PRIMARY KEY, user_id int, FOREIGN KEY (user_id) REFERENCES users(id))");
    await DB.query(ctx, id, "INSERT INTO users(name, born, big) VALUES ('Nozi','2020-02-29', 9007199254740993), ('Pingu', NULL, 1); INSERT INTO orders(user_id) VALUES (1)");
    const s = await DB.schema(ctx, id);
    const t = s[0].tables.find((x) => x.name === "orders")!;
    expect(t.fks[0]).toMatchObject({ columns: ["user_id"], refTable: "users" });
    expect(s[0].tables.find((x) => x.name === "users")!.columns[0]).toMatchObject({ name: "id", pk: true });
    const r = await DB.query(ctx, id, "SELECT id, name, born, big FROM users ORDER BY id");
    expect(r.rows[0]).toEqual([1, "Nozi", "2020-02-29", "9007199254740993"]);
    await DB.editRow(ctx, id, { schema: "shop", table: "users", key: { id: 2 }, values: { name: "P2" }, op: "update" });
    expect((await DB.browse(ctx, id, { schema: "shop", table: "users", filters: { name: "P2" } })).total).toBe(1);
    const slow = DB.query(ctx, id, "SELECT SLEEP(20)");
    setTimeout(() => void DB.cancel(id), 500);
    const res = await slow.catch((e: Error) => e);
    // MySQL: KILL QUERY membuat SLEEP mengembalikan 1 (bukan error).
    expect(res instanceof Error ? res.message : (res as { rows: unknown[][] }).rows[0][0]).toBeTruthy();
    const ro = DB.saveConnection(ctx, { kind: "mysql", url: env.ALEXEL_IT_MYSQL, readOnly: true });
    await expect(DB.query(ctx, ro.id, "INSERT INTO users(name) VALUES ('x')")).rejects.toThrow(/read-only/);
  });
});

describe.skipIf(!env.ALEXEL_IT_MONGO)("MongoDB", () => {
  it("insert, find, aggregate, skema", async () => {
    expect(await DB.testConnection(ctx, { kind: "mongodb", url: env.ALEXEL_IT_MONGO })).toMatch(/MongoDB 7/);
    const id = DB.saveConnection(ctx, { kind: "mongodb", url: env.ALEXEL_IT_MONGO }).id;
    await DB.query(ctx, id, "db.pets.drop()", { confirmed: true }).catch(() => {});
    await DB.query(ctx, id, `db.pets.insertMany([{ name: 'Nozi', kind: "penguin", age: 3, at: ISODate("2024-01-01T00:00:00Z") }, { name: 'Pingu', kind: 'penguin', age: 5 }, { name: 'Tom', kind: 'cat', age: 2 }])`);
    const f = await DB.query(ctx, id, "db.pets.find({ age: { $gt: 2 } }, { _id: 0 }).sort({ age: -1 })");
    expect(f.rows.map((r) => r[f.columns.findIndex((c) => c.name === "name")])).toEqual(["Pingu", "Nozi"]);
    const a = await DB.query(ctx, id, "db.pets.aggregate([{ $group: { _id: '$kind', n: { $sum: 1 } } }, { $sort: { _id: 1 } }])");
    expect(a.rows).toEqual([["cat", 1], ["penguin", 2]]);
    await expect(DB.query(ctx, id, "db.pets.deleteMany({})")).rejects.toThrow(/^CONFIRM:/);
    const s = await DB.schema(ctx, id);
    expect(s[0].tables.find((t) => t.name === "pets")!.columns.map((c) => c.name)).toContain("kind");
    const b = await DB.browse(ctx, id, { schema: null, table: "pets", limit: 2 });
    expect(b.rows).toHaveLength(2);
    expect(b.total).toBe(3);
    const ro = DB.saveConnection(ctx, { kind: "mongodb", url: env.ALEXEL_IT_MONGO, readOnly: true });
    await expect(DB.query(ctx, ro.id, "db.pets.insertOne({ a: 1 })")).rejects.toThrow(/read-only/);
  });
});

describe.skipIf(!env.ALEXEL_IT_REDIS)("Redis", () => {
  it("perintah, skema, penampil key", async () => {
    expect(await DB.testConnection(ctx, { kind: "redis", url: env.ALEXEL_IT_REDIS })).toMatch(/Redis 7/);
    const id = DB.saveConnection(ctx, { kind: "redis", url: env.ALEXEL_IT_REDIS }).id;
    await DB.query(ctx, id, `SET user:1 "Nozi"\nHSET user:2 name Pingu age 5\nRPUSH queue a b c\nZADD score 10 nozi 20 pingu\nEXPIRE user:1 600`);
    expect((await DB.query(ctx, id, "GET user:1")).rows).toEqual([["Nozi"]]);
    const s = await DB.schema(ctx, id);
    expect(s.find((g) => g.name === "user:")!.tables.map((t) => [t.name, t.detail])).toEqual([["user:1", "string"], ["user:2", "hash"]]);
    const h = await DB.browse(ctx, id, { schema: null, table: "user:2" });
    expect(h.rows).toEqual([["name", "Pingu"], ["age", "5"]]);
    expect((await DB.browse(ctx, id, { schema: null, table: "user:1" })).message).toMatch(/TTL/);
    expect((await DB.browse(ctx, id, { schema: null, table: "score" })).rows).toEqual([["nozi", "10"], ["pingu", "20"]]);
    await expect(DB.query(ctx, id, "FLUSHALL")).rejects.toThrow(/^CONFIRM:/);
    const ro = DB.saveConnection(ctx, { kind: "redis", url: env.ALEXEL_IT_REDIS, readOnly: true });
    await expect(DB.query(ctx, ro.id, "SET a 1")).rejects.toThrow(/read-only/);
    expect((await DB.query(ctx, ro.id, "DBSIZE")).rows[0][0]).toBeGreaterThan(0);
  });
});
