import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { languageFor } from "../editor/languages";
import { computeDiagnostics, jsonDiagnostics } from "../editor/lint";
import { snippetsFor } from "../editor/snippets";
import { extractSymbols } from "../editor/symbols";

async function stateFor(name: string, doc: string) {
  const lang = await languageFor(name).load();
  const st = EditorState.create({ doc, extensions: [lang] });
  ensureSyntaxTree(st, st.doc.length, 5000);
  return st;
}

describe("languageFor", () => {
  it("mengenali bahasa umum", () => {
    expect(languageFor("a.ts").name).toBe("TypeScript");
    expect(languageFor("A.tsx").name).toBe("TypeScript (TSX)");
    expect(languageFor("x.php").id).toBe("php");
    expect(languageFor("Dockerfile").name).toBe("Dockerfile");
    expect(languageFor("tsconfig.json").id).toBe("jsonc");
    expect(languageFor("package.json").id).toBe("json");
    expect(languageFor("main.rs").name).toBe("Rust");
  });
  it("memuat paket bahasa secara lazy", async () => {
    const ext = await languageFor("a.py").load();
    expect(ext).toBeTruthy();
    const php = await languageFor("a.php").load();
    expect(php).toBeTruthy();
  });
});

describe("lint", () => {
  it("kode valid tidak memunculkan error palsu", async () => {
    const ts = await stateFor("a.ts", "const x: number = 1;\nfunction f(a: string) {\n  return `${a}\n multi`;\n}\n");
    expect(computeDiagnostics("ts", ts)).toEqual([]);
    const rs = await stateFor("a.rs", "fn f<'a>(x: &'a str) -> &'a str { x }\n");
    expect(computeDiagnostics("rs", rs)).toEqual([]);
    const css = await stateFor("a.css", "#header { color: red; }\n.a > .b { margin: 0 }\n");
    expect(computeDiagnostics("css", css)).toEqual([]);
    const py = await stateFor("a.py", 'def f():\n    """dok\n    multi"""\n    return 1\n');
    expect(computeDiagnostics("py", py)).toEqual([]);
  });
  it("menemukan error sintaks nyata", async () => {
    const ts = await stateFor("a.ts", "function f( {\n  return 1;\n");
    expect(computeDiagnostics("ts", ts).length).toBeGreaterThan(0);
  });
  it("JSON: posisi error dan jsonc tidak divalidasi ketat", async () => {
    expect(jsonDiagnostics('{"a": 1}')).toEqual([]);
    const d = jsonDiagnostics('{"a": 1,}');
    expect(d.length).toBe(1);
    expect(d[0].from).toBeGreaterThan(0);
    const jsonc = await stateFor("tsconfig.json", '{\n  // komentar\n  "a": 1\n}');
    expect(computeDiagnostics("jsonc", jsonc).filter((x) => x.source === "JSON")).toEqual([]);
  });
});

describe("simbol & snippet", () => {
  it("mengekstrak fungsi, kelas, dan judul", () => {
    const ts = extractSymbols("ts", "export function a() {}\nclass B {\n  run() {\n  }\n}\nexport const c = async (x) => x;\ninterface D {}\n");
    expect(ts.map((s) => s.name)).toEqual(["a", "B", "run", "c", "D"]);
    const md = extractSymbols("md", "# Judul\n```\n# bukan judul\n```\n## Sub\n");
    expect(md.map((s) => [s.name, s.depth])).toEqual([["Judul", 0], ["Sub", 1]]);
    const rs = extractSymbols("rs", "pub struct A;\nimpl A {\n    pub fn new() -> Self { A }\n}\n");
    expect(rs.map((s) => s.name)).toEqual(["A", "A", "new"]);
  });
  it("menyediakan snippet tanpa mematikan completion bawaan", () => {
    expect(snippetsFor("ts").length).toBeGreaterThan(3);
    expect(snippetsFor("go")).toEqual([]);
  });
});
