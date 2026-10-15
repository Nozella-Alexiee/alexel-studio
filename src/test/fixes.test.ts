import { describe, expect, it } from "vitest";
import { detectIndent, minimalChange } from "../lib/text";

describe("deteksi indentasi", () => {
  it("tab, spasi 2/4, Makefile, dan tanpa petunjuk", () => {
    expect(detectIndent("a\n\tb\n\tc\n\t\td\n")).toBe("\t");
    expect(detectIndent("if x:\n    y\n    z\n        w\n    v\n")).toBe("    ");
    expect(detectIndent("{\n  a: 1,\n  b: {\n    c: 2\n  }\n}\n")).toBe("  ");
    expect(detectIndent("all:\n  echo hi\n", "Makefile")).toBe("\t");
    expect(detectIndent("satu baris saja")).toBeNull();
  });
});

describe("perubahan minimal", () => {
  it("hanya bagian yang berbeda, supaya kursor tidak lompat", () => {
    expect(minimalChange("abc", "abc")).toBeNull();
    expect(minimalChange("halo dunia", "halo semua dunia")).toEqual({ from: 5, to: 5, insert: "semua " });
    expect(minimalChange("a\nb\nc", "a\nX\nc")).toEqual({ from: 2, to: 3, insert: "X" });
    expect(minimalChange("abc", "")).toEqual({ from: 0, to: 3, insert: "" });
  });
});

describe("path lintas OS", () => {
  it("Windows: drive, beda huruf besar/kecil, dirname akar", async () => {
    const P = await import("../lib/paths");
    expect(P.dirname("C:/proj")).toBe("C:/");
    expect(P.isInside("C:/Users/A/proj", "c:/users/a/proj/src/x.ts")).toBe(true);
    expect(P.relative("C:/Users/A/proj", "C:/Users/A/proj/src/x.ts")).toBe("src/x.ts");
    expect(P.isInside("/home/a/proj", "/home/a/Proj/x")).toBe(false);
    expect(P.shortenHome("C:/Users/Ana/proj")).toBe("~/proj");
    expect(P.shortenHome("/home/ana/proj")).toBe("~/proj");
    expect(P.validateName("a:b.txt")).toBeTruthy();
    expect(P.validateName("CON.txt")).toBeTruthy();
    expect(P.validateName("main.ts")).toBeNull();
  });
  it("URI berkas LSP untuk Windows & POSIX", async () => {
    const { fileUri, uriToPath } = await import("../editor/lsp");
    expect(fileUri("C:/a b/x.ts")).toBe("file:///C:/a%20b/x.ts");
    expect(uriToPath("file:///c%3A/a%20b/x.ts")).toBe("C:/a b/x.ts");
    expect(fileUri("/Users/a/x.ts")).toBe("file:///Users/a/x.ts");
    expect(uriToPath("file:///Users/a/x.ts")).toBe("/Users/a/x.ts");
  });
});
