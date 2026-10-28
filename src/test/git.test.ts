import { describe, expect, it } from "vitest";
import { layoutGraph } from "../lib/gitGraph";
import { hunkAtLine, hunkPatch } from "../lib/diff";

describe("graph commit", () => {
  it("garis lurus satu cabang", () => {
    const r = layoutGraph([{ sha: "c", parents: ["b"] }, { sha: "b", parents: ["a"] }, { sha: "a", parents: [] }]);
    expect(r.map((x) => x.lane)).toEqual([0, 0, 0]);
    expect(r[0]).toMatchObject({ into: [], out: [0], through: [] });
    expect(r[1]).toMatchObject({ into: [0], out: [0] });
    expect(r[2]).toMatchObject({ into: [0], out: [] });
  });
  it("merge: dua parent membuka kolom kedua lalu bertemu lagi", () => {
    // m = merge(b, x); x dan b sama-sama dari a
    const r = layoutGraph([
      { sha: "m", parents: ["b", "x"] },
      { sha: "x", parents: ["a"] },
      { sha: "b", parents: ["a"] },
      { sha: "a", parents: [] },
    ]);
    expect(r[0]).toMatchObject({ lane: 0, out: [0, 1] });
    expect(r[1]).toMatchObject({ lane: 1, into: [1], through: [0], out: [1] });
    // b menunggu a juga: a sudah ditunggu kolom 1 → garis b menyambung ke kolom 1
    expect(r[2]).toMatchObject({ lane: 0, into: [0], through: [1], out: [1] });
    expect(r[3]).toMatchObject({ lane: 1, into: [1], out: [] });
    expect(Math.max(...r.map((x) => x.width))).toBe(2);
  });
});

describe("patch per bagian", () => {
  const head = "1\n2\n3\n4\n5\n";
  it("baris diubah", () => {
    const cur = "1\nDUA\n3\n4\nLIMA\n";
    const h = hunkAtLine(head, cur, 2)!;
    expect(h).toEqual({ oldStart: 1, oldLines: ["2"], newStart: 1, newLines: ["DUA"] });
    expect(hunkPatch("a.txt", head, cur, h)).toBe("diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -2,1 +2,1 @@\n-2\n+DUA\n");
    expect(hunkAtLine(head, cur, 3)).toBe(null);
  });
  it("sisipan dan hapus murni", () => {
    const ins = "1\n2\nbaru\n3\n4\n5\n";
    const h = hunkAtLine(head, ins, 3)!;
    expect(hunkPatch("a", head, ins, h)).toContain("@@ -2,0 +3,1 @@\n+baru\n");
    const del = "1\n2\n4\n5\n";
    const d = hunkAtLine(head, del, 3)!;
    expect(d.oldLines).toEqual(["3"]);
    expect(hunkPatch("a", head, del, d)).toContain("@@ -3,1 +2,0 @@\n-3\n");
  });
  it("baris terakhir tanpa newline diberi penanda", () => {
    const cur = "1\n2\n3\n4\nX";
    const h = hunkAtLine(head, cur, 5)!;
    expect(hunkPatch("a", head, cur, h)).toMatch(/\+X\n\\ No newline at end of file\n$/);
  });
});
