import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Ctx } from "../util";
import * as DB from "./index";
import { composeServices, detect, detectFull, parseEnv } from "./detect";
import { looseToJson, splitArgs } from "./loose";
import { mongoRisk, parseMongo } from "./drivers/mongo";
import { redisRisk, splitRedis } from "./drivers/redis";
import { isWrite, riskOf, splitStatements } from "./risk";

const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), `alexel-db-${p}-`));
const ctxFor = (userData: string) => ({ userData }) as unknown as Ctx;

describe("risk", () => {
  it("memecah statement dengan memperhatikan string dan komentar", () => {
    expect(splitStatements("SELECT ';'; -- a;b\nSELECT 2; /* x; */ SELECT 3")).toEqual(["SELECT ';'", "-- a;b\nSELECT 2", "/* x; */ SELECT 3"]);
  });
  it("menandai query berbahaya", () => {
    expect(riskOf("delete from t")).toMatch(/WHERE/);
    expect(riskOf("DELETE FROM t WHERE id = 1")).toBeNull();
    expect(riskOf("select 'drop table x'")).toBeNull();
    expect(riskOf("SELECT 1; DROP TABLE x")).toMatch(/DROP/);
    expect(riskOf("update t set a = 1 -- where id = 1")).toMatch(/UPDATE/);
  });
  it("membedakan baca/tulis", () => {
    expect(isWrite("SELECT * FROM t")).toBe(false);
    expect(isWrite("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(false);
    expect(isWrite("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x")).toBe(true);
    expect(isWrite("insert into t values (1)")).toBe(true);
  });
});

describe("mongo & redis parsing", () => {
  it("mengubah literal shell Mongo jadi JSON", () => {
    expect(JSON.parse(looseToJson(`{ name: 'Nozi', age: { $gt: 3 }, tags: ["a", 'b',], }`))).toEqual({ name: "Nozi", age: { $gt: 3 }, tags: ["a", "b"] });
    expect(JSON.parse(looseToJson(`{_id: ObjectId("64b7f0c2a1b2c3d4e5f60718"), at: ISODate("2024-01-01")}`))).toEqual({ _id: { $oid: "64b7f0c2a1b2c3d4e5f60718" }, at: { $date: "2024-01-01" } });
    expect(JSON.parse(looseToJson(`{ s: "it's: fine", t: 'say "hi"' }`))).toEqual({ s: "it's: fine", t: 'say "hi"' });
    expect(splitArgs(`{a: 1, b: [1,2]}, {c: "x,y"}`)).toEqual(["{a: 1, b: [1,2]}", `{c: "x,y"}`]);
  });
  it("mengurai perintah shell Mongo", () => {
    const c = parseMongo(`db.users.find({ age: { $gt: 18 } }, {name: 1}).sort({ age: -1 }).limit(5);`);
    expect(c).toMatchObject({ coll: "users", method: "find", args: ["{ age: { $gt: 18 } }", "{name: 1}"] });
    expect(c.chain.map((x) => x.method)).toEqual(["sort", "limit"]);
    expect(parseMongo(`db.getCollection("my-coll").countDocuments({})`).coll).toBe("my-coll");
    expect(parseMongo(`db.runCommand({ ping: 1 })`)).toMatchObject({ coll: null, method: "runCommand" });
    expect(() => parseMongo("SELECT 1")).toThrow();
    expect(mongoRisk("db.users.deleteMany({})")).toMatch(/kosong/);
    expect(mongoRisk("db.users.deleteMany({ a: 1 })")).toBeNull();
    expect(mongoRisk("db.users.drop()")).toMatch(/drop/);
  });
  it("mengurai perintah redis-cli", () => {
    expect(splitRedis(`SET "user:1" 'a b' plain`)).toEqual(["SET", "user:1", "a b", "plain"]);
    expect(redisRisk("FLUSHALL")).toMatch(/Redis/);
    expect(redisRisk("GET a")).toBeNull();
  });
});

describe("detect", () => {
  it("menemukan URL di .env, compose, dan berkas SQLite tanpa membocorkan password", () => {
    const root = tmp("detect");
    fs.writeFileSync(path.join(root, ".env"), "DATABASE_URL=\"postgresql://app:s3cret@localhost:5433/shop\"\nREDIS_URL=redis://localhost:6379\nOTHER=1\n");
    fs.writeFileSync(
      path.join(root, "docker-compose.yml"),
      `services:\n  db:\n    image: mysql:8\n    ports:\n      - "3307:3306"\n    environment:\n      MYSQL_ROOT_PASSWORD: rootpw\n      MYSQL_DATABASE: shop\n  web:\n    image: node:22\n`
    );
    fs.mkdirSync(path.join(root, "data"));
    new DatabaseSync(path.join(root, "data", "app.db")).exec("CREATE TABLE t(a)");
    fs.writeFileSync(path.join(root, "fake.db"), "not sqlite");
    const list = detect(root);
    expect(list.map((d) => d.kind).sort()).toEqual(["mysql", "postgres", "redis", "sqlite"]);
    const pg = list.find((d) => d.kind === "postgres")!;
    expect(pg.url).toBe("postgresql://app@localhost:5433/shop");
    expect(pg.hasPassword).toBe(true);
    expect(JSON.stringify(list)).not.toContain("s3cret");
    expect(JSON.stringify(list)).not.toContain("rootpw");
    const my = detectFull(root).find((d) => d.kind === "mysql")!;
    expect(my).toMatchObject({ url: "mysql://root@localhost:3307/shop", password: "rootpw" });
  });
  it("mengurai .env dan compose", () => {
    expect(parseEnv("export A='x y'\nB=1 # c\n#C=2")).toEqual({ A: "x y", B: "1" });
    expect(composeServices("services:\n  r:\n    image: redis:7\n    ports: [\"6380:6379\"]\n")[0]).toMatchObject({ name: "r", image: "redis:7", ports: ["6380:6379"] });
  });
});

describe("builder SQL", () => {
  it("mengutip identifier dan memakai parameter", () => {
    expect(DB.buildBrowse("postgres", { schema: "public", table: 'we"ird', orderBy: "id", desc: true, limit: 50, offset: 100, filters: { name: "no" } })).toEqual({
      sql: `SELECT * FROM "public"."we""ird" WHERE "name"::text LIKE $1 ORDER BY "id" DESC LIMIT 50 OFFSET 100`,
      params: ["%no%"],
      countSql: `SELECT COUNT(*) FROM "public"."we""ird" WHERE "name"::text LIKE $1`,
    });
    expect(DB.buildEdit("mysql", { schema: "shop", table: "t", key: { id: 3 }, values: { a: "x" }, op: "update" })).toEqual({ sql: "UPDATE `shop`.`t` SET `a` = ? WHERE `id` = ?", params: ["x", 3] });
    expect(() => DB.buildEdit("sqlite", { schema: null, table: "t", key: {}, op: "delete" })).toThrow(/primary key/);
  });
  it("memisahkan password dari URL", () => {
    expect(DB.splitUrlPassword("postgres://u:p%40ss@h:5432/db")).toEqual({ url: "postgres://u@h:5432/db", password: "p@ss" });
    expect(DB.kindFromUrl("mongodb+srv://x")).toBe("mongodb");
    expect(DB.kindFromUrl("mariadb://x")).toBe("mysql");
  });
});

describe("SQLite end-to-end", () => {
  const ud = tmp("ud");
  const ctx = ctxFor(ud);
  const file = path.join(tmp("sq"), "shop.db");
  const raw = new DatabaseSync(file);
  raw.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, big INTEGER, pic BLOB);
    CREATE TABLE orders(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), total REAL);
    INSERT INTO users(name, big, pic) VALUES ('Nozi', 9007199254740993, x'00ff'), ('Pingu', 2, NULL), ('Al,ex', 3, NULL);
    INSERT INTO orders(user_id, total) VALUES (1, 10.5), (1, 3), (2, 7);`);
  raw.close();
  let id = "";
  afterAll(() => DB.closeAll());

  it("menyimpan koneksi tanpa password di berkas", () => {
    const c = DB.saveConnection(ctx, { kind: "sqlite", file, name: "Shop" });
    id = c.id;
    expect(DB.listConnections(ctx)).toHaveLength(1);
    const pg = DB.saveConnection(ctx, { kind: "postgres", url: "postgresql://u:topsecret@localhost/db" });
    expect(pg.hasPassword).toBe(true);
    expect(fs.readFileSync(path.join(ud, "db-connections.json"), "utf8")).not.toContain("topsecret");
    return DB.removeConnection(ctx, pg.id);
  });

  it("uji koneksi, skema, query, batas baris", async () => {
    expect(await DB.testConnection(ctx, { kind: "sqlite", file })).toMatch(/^SQLite 3/);
    const s = await DB.schema(ctx, id);
    const orders = s[0].tables.find((t) => t.name === "orders")!;
    expect(orders.fks).toEqual([{ columns: ["user_id"], refSchema: null, refTable: "users", refColumns: ["id"] }]);
    expect(s[0].tables.find((t) => t.name === "users")!.columns.find((c) => c.name === "id")!.pk).toBe(true);
    const r = await DB.query(ctx, id, "SELECT id, name, big, pic FROM users ORDER BY id", { limit: 2 });
    expect(r.columns.map((c) => c.name)).toEqual(["id", "name", "big", "pic"]);
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
    expect(r.rows[0][3]).toBe("\\x00ff");
    expect(r.rows[0][2]).toBe("9007199254740993");
    expect(r.rows[1][2]).toBe(2);
    expect(DB.schemaText("sqlite", s)).toContain("orders(id INTEGER PK, user_id INTEGER, total REAL) FK(user_id)→users(id)");
  });

  it("meminta konfirmasi untuk query berbahaya", async () => {
    await expect(DB.query(ctx, id, "DELETE FROM orders")).rejects.toThrow(/^CONFIRM:/);
    const r = await DB.query(ctx, id, "UPDATE orders SET total = total WHERE id = 1");
    expect(r.affected).toBe(1);
    expect(DB.history(ctx, id)[0].text).toContain("UPDATE orders");
  });

  it("browse, edit baris, ekspor", async () => {
    const b = await DB.browse(ctx, id, { schema: null, table: "users", orderBy: "id", filters: { name: "i" } });
    expect(b.total).toBe(2);
    expect(b.rows.map((r) => r[1])).toEqual(["Nozi", "Pingu"]);
    await DB.editRow(ctx, id, { schema: null, table: "users", key: { id: 2 }, values: { name: "Pingu 2" }, op: "update" });
    await DB.editRow(ctx, id, { schema: null, table: "users", key: {}, values: { name: "Baru" }, op: "insert" });
    await DB.editRow(ctx, id, { schema: null, table: "users", key: { id: 4 }, op: "delete" });
    const out = path.join(tmp("exp"), "u.csv");
    expect(await DB.exportQuery(ctx, id, "SELECT id, name FROM users ORDER BY id", "csv", out)).toEqual({ rows: 3 });
    expect(fs.readFileSync(out, "utf8")).toBe('id,name\n1,Nozi\n2,Pingu 2\n3,"Al,ex"\n');
  });

  it("read-only memblokir tulis", async () => {
    const ro = DB.saveConnection(ctx, { kind: "sqlite", file, readOnly: true });
    await expect(DB.query(ctx, ro.id, "INSERT INTO orders(user_id,total) VALUES (1,1)")).rejects.toThrow(/read-only/);
    await expect(DB.editRow(ctx, ro.id, { schema: null, table: "users", key: { id: 1 }, op: "delete" })).rejects.toThrow(/read-only/);
    expect((await DB.query(ctx, ro.id, "SELECT COUNT(*) n FROM users")).rows[0][0]).toBe(3);
  });

  it("membatalkan query panjang", async () => {
    const slow = DB.query(ctx, id, "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 20000000) SELECT COUNT(*) FROM c", { timeoutMs: 60_000 });
    setTimeout(() => void DB.cancel(id), 300);
    await expect(slow).rejects.toThrow(/dibatalkan/);
    expect((await DB.query(ctx, id, "SELECT 1")).rows[0][0]).toBe(1);
  });
});
