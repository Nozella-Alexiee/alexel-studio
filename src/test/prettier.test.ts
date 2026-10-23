import { describe, expect, it } from "vitest";
import { formatWithPrettier, prettierParser } from "../editor/prettierFormat";
import { languageDataFrom } from "../extensions/textmate";

const opts = { tabWidth: 2, useTabs: false };

describe("Prettier bawaan", () => {
  it("memilih parser dari nama berkas", () => {
    expect(prettierParser("/a/b.tsx")).toBe("typescript");
    expect(prettierParser("C:\\x\\y.mjs")).toBe("babel");
    expect(prettierParser("/p/tsconfig.app.json")).toBe("json");
    expect(prettierParser("/p/README.md")).toBe("markdown");
    expect(prettierParser("/p/main.rs")).toBeNull();
    expect(prettierParser("/p/Makefile")).toBeNull();
  });

  it("merapikan TypeScript, JSON, CSS, YAML, Markdown, HTML", async () => {
    expect(await formatWithPrettier("const a={b:1,c:[1,2]}", "/x.ts", opts)).toBe("const a = { b: 1, c: [1, 2] };\n");
    expect(await formatWithPrettier('{"a":1,"b":[1,2]}', "/x.json", opts)).toBe('{ "a": 1, "b": [1, 2] }\n');
    expect(await formatWithPrettier("a{color:red;margin:0}", "/x.css", opts)).toBe("a {\n  color: red;\n  margin: 0;\n}\n");
    expect(await formatWithPrettier("a:   1\nb:\n    - x", "/x.yml", opts)).toBe("a: 1\nb:\n  - x\n");
    expect(await formatWithPrettier("#  Judul\n*  a\n*  b", "/x.md", opts)).toBe("# Judul\n\n- a\n- b\n");
    expect(await formatWithPrettier("<div><p>hai</p></div>", "/x.html", opts)).toContain("<p>hai</p>");
  });

  it("memakai aturan project dan melempar galat sintaks", async () => {
    expect(await formatWithPrettier("const a = 'x'", "/x.ts", opts, { singleQuote: true, semi: false })).toBe("const a = 'x'\n");
    await expect(formatWithPrettier("const = ;", "/x.ts", opts)).rejects.toThrow();
  });

  it("file tak dikenal tidak diformat", async () => {
    expect(await formatWithPrettier("x", "/x.rs", opts)).toBeNull();
  });
});

describe("language-configuration → data bahasa CodeMirror", () => {
  it("komentar baris/blok dan pasangan kurung", () => {
    const d = languageDataFrom({ comments: { lineComment: "//", blockComment: ["/*", "*/"] }, autoClosingPairs: [{ open: "{", close: "}" }, ["(", ")"], { open: "/*", close: "*/" }] });
    expect(d.commentTokens).toEqual({ line: "//", block: { open: "/*", close: "*/" } });
    expect(d.closeBrackets).toEqual({ brackets: ["{", "("] });
  });

  it("kosong atau rusak menghasilkan data kosong", () => {
    expect(languageDataFrom(null)).toEqual({});
    expect(languageDataFrom({ comments: {} })).toEqual({});
  });
});
