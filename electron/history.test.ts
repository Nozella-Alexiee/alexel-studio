import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { historyDir, historyList, snapshot, _test } from "./history";
import type { Ctx } from "./util";

const ctx = (): Ctx => ({ userData: fs.mkdtempSync(path.join(os.tmpdir(), "nozel-hist-")), emit: () => {}, trash: async () => {}, reveal: () => {} });
const posix = process.platform === "win32" ? it.skip : it;

describe("history: snapshot yang hilang bersamaan", () => {
  afterEach(() => vi.restoreAllMocks());

  posix("entri yang sudah tidak ada saat di-stat dilewati, historyList tidak melempar", () => {
    const c = ctx();
    const file = "/proj/a.ts";
    snapshot(c, file, "satu\n");
    const dir = historyDir(c, file);
    // Nama terdaftar di readdir tetapi berkasnya sudah tidak ada (symlink menggantung = stat ENOENT).
    fs.symlinkSync(path.join(dir, "tidak-ada"), path.join(dir, "1.snap"));
    expect(_test.listSorted(dir).map((x) => x.t)).not.toContain(1);
    const list = historyList(c, file);
    expect(list).toHaveLength(1);
    expect(list[0].lines).toBe(2);
  });

  it("snapshot terhapus di antara stat dan baca: dilewati", () => {
    const c = ctx();
    const file = "/proj/b.ts";
    snapshot(c, file, "v1");
    snapshot(c, file, "v2");
    const all = _test.listSorted(historyDir(c, file));
    expect(all).toHaveLength(2);
    const gone = all[0].p;
    const real = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation(((p: fs.PathOrFileDescriptor, o?: unknown) => {
      if (p === gone) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return (real as (p: fs.PathOrFileDescriptor, o?: unknown) => string | Buffer)(p, o);
    }) as typeof fs.readFileSync);
    const list = historyList(c, file);
    expect(list.map((x) => x.id)).toEqual([String(all[1].t)]);
  });
});
