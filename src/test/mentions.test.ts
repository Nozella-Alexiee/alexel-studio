import { describe, expect, it } from "vitest";
import { formatProblems, parseMentions } from "../claude/mentions";

describe("konteks @", () => {
  it("mengenali mention konteks, bukan path berkas", () => {
    expect(parseMentions("lihat @problems dan @terminal, lalu @problems lagi")).toEqual(["problems", "terminal"]);
    expect(parseMentions("@git-diff.")).toEqual(["git-diff"]);
    expect(parseMentions("buka @src/problems.ts dan email a@terminal")).toEqual([]);
    expect(parseMentions("@open-editors")).toEqual(["open-editors"]);
  });
  it("daftar masalah ringkas, error dulu", () => {
    const t = formatProblems(
      {
        "/p/a.ts": [{ line: 3, col: 1, message: "pakai let", severity: "warning", source: "lint" }],
        "/p/b.ts": [{ line: 1, col: 5, message: "tipe salah\n  detail", severity: "error" }],
      },
      "/p"
    );
    expect(t.split("\n")).toEqual(["b.ts:1:5 error tipe salah detail", "a.ts:3:1 warning pakai let (lint)"]);
  });
});
