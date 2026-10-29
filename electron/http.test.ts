import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "./util";
import { cancelHttp, listHttpSecrets, sendHttp, setHttpSecret } from "./http";

const ctx = { userData: fs.mkdtempSync(path.join(os.tmpdir(), "alexel-http-")) } as unknown as Ctx;
let base = "";
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    if (req.url === "/slow") return void setTimeout(() => res.end("late"), 5000);
    if (req.url === "/img") {
      res.setHeader("content-type", "image/png");
      return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
    }
    if (req.url === "/redir") {
      res.statusCode = 302;
      res.setHeader("location", "/echo");
      return res.end();
    }
    res.setHeader("content-type", "application/json");
    res.setHeader("x-test", "1");
    res.end(JSON.stringify({ method: req.method, url: req.url, auth: req.headers.authorization ?? null, ct: req.headers["content-type"] ?? null, body }));
  });
});
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("sendHttp", () => {
  it("mengirim method, header, body dan membaca JSON", async () => {
    const r = await sendHttp(ctx, "a", { method: "post", url: `${base}/echo?q=1`, headers: [["Content-Type", "application/json"]], body: '{"a":1}' });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text!)).toMatchObject({ method: "POST", url: "/echo?q=1", ct: "application/json", body: '{"a":1}' });
    expect(r.headers).toContainEqual(["x-test", "1"]);
    expect(r.size).toBeGreaterThan(10);
  });
  it("mengisi rahasia dan .env di main process", async () => {
    setHttpSecret(ctx, "TOKEN", "s3cr3t");
    expect(listHttpSecrets(ctx)).toEqual(["TOKEN"]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-http-root-"));
    fs.writeFileSync(path.join(root, ".env"), "API_PATH=echo\n");
    const r = await sendHttp(ctx, "b", { method: "GET", url: `${base}/{{$dotenv API_PATH}}`, headers: [["Authorization", "Bearer {{$secret TOKEN}}"]], root });
    expect(JSON.parse(r.text!)).toMatchObject({ url: "/echo", auth: "Bearer s3cr3t" });
    await expect(sendHttp(ctx, "c", { method: "GET", url: `${base}/`, headers: [["x", "{{$secret NOPE}}"]] })).rejects.toThrow(/NOPE/);
  });
  it("body dari berkas, biner, redirect", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-http-f-"));
    fs.writeFileSync(path.join(dir, "data.json"), '{"from":"file"}');
    const r = await sendHttp(ctx, "d", { method: "PUT", url: `${base}/echo`, headers: [], bodyFile: "./data.json", baseDir: dir });
    expect(JSON.parse(r.text!).body).toBe('{"from":"file"}');
    const img = await sendHttp(ctx, "e", { method: "GET", url: `${base}/img`, headers: [] });
    expect(img.text).toBeNull();
    expect(Buffer.from(img.base64!, "base64")[1]).toBe(0x50);
    const red = await sendHttp(ctx, "f", { method: "GET", url: `${base}/redir`, headers: [] });
    expect(red.redirected).toBe(true);
    expect(red.url).toMatch(/\/echo$/);
  });
  it("batal, batas waktu, dan menolak skema selain http", async () => {
    const p = sendHttp(ctx, "g", { method: "GET", url: `${base}/slow`, headers: [] });
    setTimeout(() => cancelHttp("g"), 100);
    await expect(p).rejects.toThrow(/dibatalkan/);
    await expect(sendHttp(ctx, "h", { method: "GET", url: `${base}/slow`, headers: [], timeoutMs: 1000 })).rejects.toThrow(/1 detik/);
    await expect(sendHttp(ctx, "i", { method: "GET", url: "file:///etc/passwd", headers: [] })).rejects.toThrow(/http/);
  });
});
