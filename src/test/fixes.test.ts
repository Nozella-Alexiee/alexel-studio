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
