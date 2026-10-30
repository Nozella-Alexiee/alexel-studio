import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "./util";

// Koneksi TCP ke adapter dipalsukan: mode "ok" langsung tersambung, mode "fail" selalu ECONNREFUSED.
const net = vi.hoisted(() => ({ mode: "ok" as "ok" | "fail", connects: 0 }));
vi.mock("node:net", async (orig) => {
  const actual = (await orig()) as typeof import("node:net");
  const connect = () => {
    net.connects++;
    const sock = Object.assign(new EventEmitter(), {
      write: () => true,
      destroy() {
        queueMicrotask(() => sock.emit("close"));
        return sock;
      },
    });
    const mode = net.mode;
    queueMicrotask(() => (mode === "ok" ? sock.emit("connect") : sock.emit("error", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))));
    return sock;
  };
  return { ...actual, default: { ...actual, connect }, connect };
});

const { dapStart, dapStartChild, dapSend, killAllDap } = await import("./dap");

afterEach(() => {
  killAllDap();
  vi.useRealTimers();
  net.mode = "ok";
});

/** Adapter "node" palsu: skrip dapDebugServer.js yang hanya diam (koneksinya dipalsukan di atas). */
function fakeCtx() {
  const userData = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-dap-")));
  const dir = path.join(userData, "debug", "js-debug-v1.140.0", "js-debug", "src");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "dapDebugServer.js"), "setInterval(() => {}, 1000);\n");
  return { userData, emit: vi.fn(), trash: async () => {}, reveal: () => {} } as unknown as Ctx;
}

describe("dapStartChild", () => {
  it("sesi anak yang gagal tersambung dibersihkan, id-nya bisa dipakai ulang", async () => {
    const ctx = fakeCtx();
    await dapStart(ctx, "parent", "node", os.tmpdir());

    net.mode = "fail";
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const before = net.connects;
    const failed = dapStartChild(ctx, "parent", "child-1");
    const settled = expect(failed).rejects.toThrow(/ECONNREFUSED/);
    await vi.advanceTimersByTimeAsync(41 * 150 + 100);
    await settled;
    expect(net.connects - before).toBe(41); // percobaan awal + 40 ulangan
    vi.useRealTimers();

    // Tidak ada sesi tanpa koneksi yang tertinggal.
    expect(() => dapSend("child-1", { seq: 1 })).toThrow(/tidak berjalan/);

    net.mode = "ok";
    await expect(dapStartChild(ctx, "parent", "child-1")).resolves.toEqual({ id: "child-1" });
    expect(() => dapSend("child-1", { seq: 1 })).not.toThrow();
  });

  it("id yang sedang dipakai tetap ditolak", async () => {
    const ctx = fakeCtx();
    await dapStart(ctx, "parent", "node", os.tmpdir());
    await dapStartChild(ctx, "parent", "child-2");
    await expect(dapStartChild(ctx, "parent", "child-2")).rejects.toThrow(/tidak valid/);
  });
});
