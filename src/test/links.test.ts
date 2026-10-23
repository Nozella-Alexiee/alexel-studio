import { describe, expect, it } from "vitest";
import { candidates, findLocations } from "../terminal/links";

const f = (t: string) => findLocations(t).map((l) => [t.slice(l.start, l.start + l.length), l.path, l.line, l.col]);

describe("tautan lokasi di terminal", () => {
  it("path:baris:kolom dan path:baris", () => {
    expect(f("src/app/run.ts:12:5 error TS2304")).toEqual([["src/app/run.ts:12:5", "src/app/run.ts", 12, 5]]);
    expect(f("  ./a.py:3: warning")).toEqual([["./a.py:3", "./a.py", 3, 1]]);
    expect(f("error[E0308]: --> src/main.rs:5:9")).toEqual([["src/main.rs:5:9", "src/main.rs", 5, 9]]);
  });

  it("gaya MSVC/TypeScript dengan tanda kurung", () => {
    expect(f("src\\index.tsx(42,7): error TS1005")).toEqual([["src\\index.tsx(42,7)", "src\\index.tsx", 42, 7]]);
  });

  it("Python traceback dan stack Node", () => {
    expect(f('  File "/p/app.py", line 14, in <module>')).toEqual([['File "/p/app.py", line 14', "/p/app.py", 14, 1]]);
    expect(f("    at run (/p/lib/x.js:10:3)")).toEqual([["/p/lib/x.js:10:3", "/p/lib/x.js", 10, 3]]);
  });

  it("path Windows dengan drive", () => {
    expect(f("C:\\proj\\a.ts:7:1 oops")).toEqual([["C:\\proj\\a.ts:7:1", "C:\\proj\\a.ts", 7, 1]]);
  });

  it("bukan URL, bukan versi, bukan angka biasa", () => {
    expect(f("listening on http://localhost:3000/a.js:1")).toEqual([]);
    expect(f("v1.2.3:4 selesai")).toEqual([]);
    expect(f("waktu 12:30:45")).toEqual([]);
  });

  it("kandidat: absolut apa adanya, relatif dari cwd lalu root", () => {
    expect(candidates("/x/a.ts", "/c", "/r")).toEqual(["/x/a.ts"]);
    expect(candidates("./src/a.ts", "/c", "/r")).toEqual(["/c/src/a.ts", "/r/src/a.ts"]);
    expect(candidates("src\\a.ts", "/r", "/r")).toEqual(["/r/src/a.ts"]);
    expect(candidates("C:\\p\\a.ts", "/c", "/r")).toEqual(["C:/p/a.ts"]);
  });
});
