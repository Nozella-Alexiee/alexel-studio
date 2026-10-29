// Regresi audit rilis 1.0: database produksi, debug, kernel notebook, tab browser.

import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/ipc";

afterEach(() => vi.restoreAllMocks());

describe("konfirmasi query di koneksi produksi", () => {
  it("SQL: semua statement diperiksa, CTE yang menulis tidak lolos", async () => {
    const { prodNeedsConfirm } = await import("../db/state");
    expect(prodNeedsConfirm("postgres", "SELECT * FROM t")).toBe(false);
    expect(prodNeedsConfirm("postgres", "WITH x AS (SELECT 1) SELECT * FROM x")).toBe(false);
    expect(prodNeedsConfirm("postgres", "SELECT 1; UPDATE t SET a = 1 WHERE id = 2")).toBe(true);
    expect(prodNeedsConfirm("postgres", "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x")).toBe(true);
    expect(prodNeedsConfirm("mysql", "-- catatan\nSELECT 1")).toBe(false);
    expect(prodNeedsConfirm("sqlite", "insert into t values (1)")).toBe(true);
  });
  it("Mongo & Redis: baca saja yang lolos", async () => {
    const { prodNeedsConfirm } = await import("../db/state");
    expect(prodNeedsConfirm("mongodb", "db.users.find({})")).toBe(false);
    expect(prodNeedsConfirm("mongodb", "db.users.findOneAndUpdate({a: 1}, {$set: {b: 2}})")).toBe(true);
    expect(prodNeedsConfirm("mongodb", "db.users.deleteMany({})")).toBe(true);
    expect(prodNeedsConfirm("redis", "GET kunci")).toBe(false);
    expect(prodNeedsConfirm("redis", "DEL kunci")).toBe(true);
    expect(prodNeedsConfirm("redis", "# baca\nGET a\nHGETALL h")).toBe(false);
    expect(prodNeedsConfirm("redis", "GET a\nFLUSHALL")).toBe(true);
    expect(prodNeedsConfirm("mongodb", 'db.users.aggregate([{ $out: "salinan" }])')).toBe(true);
  });
});

describe("klien debug", () => {
  it("stop() menolak request yang masih menunggu (tidak menggantung selamanya)", async () => {
    vi.spyOn(api, "dapSend").mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, "dapStop").mockResolvedValue(undefined as never);
    const { DapClient } = await import("../debug/client");
    const c = new DapClient("dbg-test");
    const p = c.request("threads");
    c.stop();
    await expect(p).rejects.toThrow();
    expect(c.stopped).toBe(true);
  });
});

describe("kernel notebook", () => {
  it("restart gagal tidak tertahan di status 'starting'", async () => {
    const { restartKernel, useKernels } = await import("../notebook/kernel");
    useKernels.setState({ byPath: { "/p/a.ipynb": { id: "k1", name: "python3", status: "idle" } } });
    vi.spyOn(api, "jupyterRestart").mockRejectedValue(new Error("server mati"));
    await expect(restartKernel("/p/a.ipynb")).rejects.toThrow("server mati");
    expect(useKernels.getState().byPath["/p/a.ipynb"].status).toBe("dead");
    expect(useKernels.getState().byPath["/p/a.ipynb"].error).toBe("server mati");
  });
});

describe("tab browser", () => {
  it("gagal membuat view: error tampil dan bisa dicoba lagi", async () => {
    const { ensureView, useBrowser } = await import("../browser/state");
    const tab = "nozel:browser:test";
    useBrowser.setState({ tabs: { [tab]: { view: null, url: "http://localhost:3000", title: "", loading: true, canGoBack: false, canGoForward: false, favicon: null, error: null, device: "responsive" } } });
    const create = vi.spyOn(api, "browserCreate").mockRejectedValueOnce(new Error("gagal")).mockResolvedValueOnce(7);
    await expect(ensureView(tab)).resolves.toBeNull();
    expect(useBrowser.getState().tabs[tab].error).toBe("gagal");
    expect(useBrowser.getState().tabs[tab].loading).toBe(false);
    await expect(ensureView(tab)).resolves.toBe(7);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("diff dari CLI agen (openDiff)", () => {
  it("path dengan '..' keluar project ditandai di luar; Windows beda huruf drive tetap di dalam", async () => {
    vi.spyOn(api, "readText").mockRejectedValue(new Error("tidak ada"));
    const { handleIdeTool } = await import("../ide/ide");
    const { getState, setState } = await import("../state/store");
    const check = async (root: string, file: string) => {
      setState({ root });
      const done = handleIdeTool("openDiff", { old_file_path: file, new_file_path: file, new_file_contents: "x", tab_name: "t" });
      await new Promise((r) => setTimeout(r, 0));
      const outside = getState().ideDiff?.outside;
      getState().ideDiff?.resolve("closed");
      setState({ ideDiff: null });
      await done;
      return outside;
    };
    expect(await check("/home/a/proj", "/home/a/proj/src/x.ts")).toBe(false);
    expect(await check("/home/a/proj", "/home/a/proj/../secret.txt")).toBe(true);
    expect(await check("C:/Users/A/proj", "c:\\Users\\A\\proj\\src\\x.ts")).toBe(false);
    expect(await check("C:/Users/A/proj", "C:\\Users\\A\\other\\x.ts")).toBe(true);
  });
});
