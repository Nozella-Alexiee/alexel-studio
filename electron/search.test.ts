import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPLACE_TIMEOUT_MSG, replaceInFiles } from "./search";
import type { Ctx } from "./util";

const tmp = (name: string) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `nozel-${name}-`)));
const ctx = (dir: string): Ctx => ({ userData: dir, emit: () => {}, trash: async () => {}, reveal: () => {} });
const plain = { isRegex: false, caseSensitive: true, wholeWord: false };
const regex = { isRegex: true, caseSensitive: true, wholeWord: false };

describe("replaceInFiles", () => {
  it("mengganti teks biasa (tanpa pola $) dan regex dengan grup", async () => {
    const d = tmp("rep");
    const a = path.join(d, "a.txt");
    const b = path.join(d, "b.txt");
    fs.writeFileSync(a, "foo foo bar\n");
    fs.writeFileSync(b, "tidak ada\n");
    expect(await replaceInFiles(ctx(tmp("ud")), [a, b], "foo", "$&x", plain)).toBe(2);
    expect(fs.readFileSync(a, "utf8")).toBe("$&x $&x bar\n");
    expect(fs.readFileSync(b, "utf8")).toBe("tidak ada\n");
    expect(await replaceInFiles(ctx(tmp("ud")), [a], "(\\w+) bar", "[$1]", regex)).toBe(1);
    expect(fs.readFileSync(a, "utf8")).toBe("$&x $&[x]\n");
  });

  it("regex lambat dihentikan dengan galat jelas, main tidak beku, tidak ada berkas yang berubah", async () => {
    const d = tmp("rep-redos");
    const ok = path.join(d, "ok.txt");
    const slow = path.join(d, "slow.txt");
    fs.writeFileSync(ok, "aaa\n");
    fs.writeFileSync(slow, "a".repeat(40) + "!");
    const t0 = Date.now();
    await expect(replaceInFiles(ctx(tmp("ud")), [ok, slow], "(a+)+$", "x", regex, 500)).rejects.toThrow(REPLACE_TIMEOUT_MSG);
    expect(Date.now() - t0).toBeLessThan(5000);
    // Berkas pertama cocok tapi tidak boleh sudah ditulis: pengecekan selesai dulu sebelum ada penulisan.
    expect(fs.readFileSync(ok, "utf8")).toBe("aaa\n");
    expect(fs.readFileSync(slow, "utf8")).toBe("a".repeat(40) + "!");
  }, 15000);
});
