import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { guideLevels, indentColumns } from "../editor/indentGuides";
import { scanBrackets } from "../editor/bracketColors";
import { formatLike, parseColor, toHex } from "../editor/colorPicker";
import { emmetKind, expandAt } from "../editor/emmet";
import { stickyLines } from "../editor/stickyScroll";
import { hexRow } from "../editor/BinaryViews";
import { togglePinTab, closeOtherTabs } from "../app/actions";
import { getState, setState } from "../state/store";

describe("indent guides", () => {
  it("kolom indent dengan tab & spasi; baris kosong ikut tetangga terkecil", () => {
    expect(indentColumns("    x", 4)).toBe(4);
    expect(indentColumns("\t  x", 4)).toBe(6);
    expect(indentColumns("   ", 4)).toBe(null);
    const doc = Text.of(["a {", "    b {", "        c", "", "        d", "    }", "}"]);
    expect(guideLevels(doc, 1, 7, 4, 4)).toEqual([0, 1, 2, 2, 2, 1, 0]);
  });
});

describe("warna kurung", () => {
  it("kedalaman bersarang dan kurung tak berpasangan", () => {
    const r = scanBrackets("f(a[1], {b: (2)})]");
    expect(r.map((x) => x.depth)).toEqual([0, 1, 1, 1, 2, 2, 1, 0, 0]);
    expect(r[r.length - 1].bad).toBe(true);
  });
});

describe("color picker", () => {
  it("parse hex/rgb/hsl dan tulis ulang dengan format asli", () => {
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#00ff0080")?.a).toBeCloseTo(0.5, 1);
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(toHex(parseColor("hsl(120, 100%, 50%)")!)).toBe("#00ff00");
    expect(parseColor("rgb(300, 0, 0)")).toBe(null);
    expect(formatLike("#fff", "#000000")).toBe("#000");
    expect(formatLike("#ffffff", "#123456")).toBe("#123456");
    expect(formatLike("rgba(0, 0, 0, 0.5)", "#ff0000")).toBe("rgba(255, 0, 0, 0.5)");
    expect(formatLike("rgb(0,0,0)", "#0000ff")).toBe("rgb(0, 0, 255)");
  });
});

describe("emmet", () => {
  it("mode per berkas", () => {
    expect(emmetKind("a.html")?.syntax).toBe("html");
    expect(emmetKind("a.tsx")?.strict).toBe(true);
    expect(emmetKind("a.scss")?.type).toBe("stylesheet");
    expect(emmetKind("a.ts")).toBe(null);
  });
  it("memperluas singkatan; JSX hanya dengan operator", () => {
    const r = expandAt("  ul>li*2", 9, emmetKind("x.html")!);
    expect(r?.start).toBe(2);
    expect(r?.template).toContain("<li>${1}</li>");
    expect(expandAt("m10", 3, emmetKind("x.css")!)?.template).toBe("margin: 10px;");
    expect(expandAt("return foo", 10, emmetKind("x.tsx")!)).toBe(null);
    expect(expandAt("div.box", 7, emmetKind("x.tsx")!)?.template).toContain('className="box"');
  });
});

describe("sticky scroll", () => {
  it("baris pembuka blok dari luar ke dalam", () => {
    const doc = Text.of(["class A {", "  m() {", "    if (x) {", "      a();", "      b();", "    }", "  }", "}"]);
    expect(stickyLines(doc, 5, 2)).toEqual([1, 2, 3]);
    expect(stickyLines(doc, 7, 2)).toEqual([1]);
    expect(stickyLines(doc, 1, 2)).toEqual([]);
  });
});

describe("hex", () => {
  it("baris hex dump", () => {
    const r = hexRow(new Uint8Array([0x41, 0x42, 0x00, 0xff]), 0);
    expect(r.off).toBe("00000000");
    expect(r.hex.startsWith("41 42 00 ff")).toBe(true);
    expect(r.ascii).toBe("AB..");
  });
});

describe("tab tersemat", () => {
  it("pindah ke kiri dan tidak ikut 'tutup tab lain'", async () => {
    const tab = (id: string) => ({ id, name: id, kind: "settings" as const, dirty: false, lang: "", preview: "code" as const });
    setState({ tabs: { a: tab("a"), b: tab("b"), c: tab("c") }, groups: [{ tabs: ["a", "b", "c"], active: "a" }], focusedGroup: 0 });
    togglePinTab("c");
    expect(getState().groups[0].tabs).toEqual(["c", "a", "b"]);
    await closeOtherTabs("a", 0);
    expect(getState().groups[0].tabs).toEqual(["c", "a"]);
    togglePinTab("c");
    expect(getState().tabs.c.pinned).toBe(false);
  });
});
