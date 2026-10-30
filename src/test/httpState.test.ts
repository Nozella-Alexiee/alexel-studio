// Klien HTTP: riwayat tanpa rahasia (template sebelum substitusi) dan respons basi tidak menimpa yang baru.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/actions", () => ({ showTab: vi.fn() }));

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  vi.resetModules();
  vi.restoreAllMocks();
});

const res = (status: number, text: string) => ({ status, statusText: "", headers: [], text, size: text.length, timeMs: 1 }) as never;

describe("riwayat HTTP", () => {
  it("disimpan sebagai template: nilai env privat dan header literal sensitif tidak ikut tersimpan", async () => {
    const { api } = await import("../lib/ipc");
    const H = await import("../http/state");
    H.useHttp.setState({ envs: { dev: { base: "https://api.contoh.id", token: "s3cr3t-env" } }, env: "dev" });
    const sendSpy = vi.spyOn(api, "httpSend").mockResolvedValue(res(200, "{}"));
    const ex = await H.send("k1", {
      method: "POST",
      url: "{{base}}/login?api_key=literal-key&page=2",
      headers: [
        ["Authorization", "Bearer {{token}}"],
        ["Cookie", "sid=cookie-literal"],
        ["Accept", "application/json"],
      ],
      body: '{"user":"a"}',
    });
    // Yang dikirim tetap hasil substitusi.
    expect(sendSpy.mock.calls[0][1].headers).toContainEqual(["Authorization", "Bearer s3cr3t-env"]);
    expect(ex?.res?.status).toBe(200);
    const h = H.useHttp.getState().history[0];
    expect(h.req.url).toBe("{{base}}/login?api_key=&page=2");
    expect(h.req.headers).toEqual([
      ["Authorization", "Bearer {{token}}"],
      ["Cookie", ""],
      ["Accept", "application/json"],
    ]);
    const saved = storage.getItem("alexel.http.history")!;
    expect(saved).not.toContain("s3cr3t-env");
    expect(saved).not.toContain("cookie-literal");
    expect(saved).not.toContain("literal-key");
    expect(saved).not.toContain("api.contoh.id");
  });

  it("entri lama yang sudah tersubstitusi disaring saat dimuat dan ditulis ulang", async () => {
    storage.setItem(
      "alexel.http.history",
      JSON.stringify([
        { req: { method: "GET", url: "https://x.id/a?token=abc123&q=1", headers: [["Authorization", "Bearer real-token"], ["X-API-Key", "kunci"], ["Accept", "*/*"]], body: null }, at: 1, status: 200 },
        { req: { method: "POST", url: "https://x.id/login", headers: [], body: '{"password":"rahasia"}' }, at: 2 },
        { req: { method: "POST", url: "https://x.id/items", headers: [], body: '{"name":"buku"}' }, at: 3 },
      ])
    );
    const H = await import("../http/state");
    const [a, b, c] = H.useHttp.getState().history;
    expect(a.req.url).toBe("https://x.id/a?token=&q=1");
    expect(a.req.headers).toEqual([["Authorization", ""], ["X-API-Key", ""], ["Accept", "*/*"]]);
    expect(b.req.body).toBeNull();
    expect(c.req.body).toBe('{"name":"buku"}');
    const saved = storage.getItem("alexel.http.history")!;
    for (const s of ["real-token", "kunci", "abc123", "rahasia"]) expect(saved).not.toContain(s);
    // Format baru tidak disaring ulang (template tetap utuh).
    expect(JSON.parse(saved).every((h: { v?: number }) => h.v === 2)).toBe(true);
  });
});

describe("send() beruntun dengan key sama", () => {
  it("respons lama yang datang belakangan tidak menimpa respons baru", async () => {
    const { api } = await import("../lib/ipc");
    const H = await import("../http/state");
    const resolvers: ((v: unknown) => void)[] = [];
    vi.spyOn(api, "httpSend").mockImplementation(() => new Promise((r) => resolvers.push(r as (v: unknown) => void)) as never);
    const first = H.send("same", { method: "GET", url: "https://x.id/1", headers: [], body: null });
    const second = H.send("same", { method: "GET", url: "https://x.id/2", headers: [], body: null });
    resolvers[1](res(201, "baru"));
    expect((await second)?.res?.text).toBe("baru");
    resolvers[0](res(200, "lama"));
    expect(await first).toBeNull();
    const ex = H.useHttp.getState().exchanges.same;
    expect(ex.res?.text).toBe("baru");
    expect(ex.running).toBe(false);
  });

  it("galat dari pengiriman basi (mis. dibatalkan) tidak menimpa request yang sedang berjalan", async () => {
    const { api } = await import("../lib/ipc");
    const H = await import("../http/state");
    const calls: { ok: (v: unknown) => void; fail: (e: unknown) => void }[] = [];
    vi.spyOn(api, "httpSend").mockImplementation(() => new Promise((ok, fail) => calls.push({ ok, fail })) as never);
    const first = H.send("k", { method: "GET", url: "https://x.id/1", headers: [], body: null });
    void H.send("k", { method: "GET", url: "https://x.id/2", headers: [], body: null });
    calls[0].fail(new Error("dibatalkan"));
    expect(await first).toBeNull();
    const ex = H.useHttp.getState().exchanges.k;
    expect(ex.running).toBe(true);
    expect(ex.error).toBeUndefined();
  });
});
