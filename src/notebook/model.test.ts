import { describe, expect, it } from "vitest";
import { appendOutput, parseNotebook, serializeNotebook, stripAnsi, toLines } from "./model";

const NB = {
  cells: [
    { cell_type: "markdown", id: "m1", metadata: {}, source: ["# Judul\n", "teks"] },
    { cell_type: "code", execution_count: 2, id: "c1", metadata: { tags: ["x"] }, outputs: [{ output_type: "stream", name: "stdout", text: ["halo\n"] }, { output_type: "execute_result", execution_count: 2, data: { "text/plain": ["3"] }, metadata: {} }], source: ["print('halo')\n", "1+2"] },
  ],
  metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
  nbformat: 4,
  nbformat_minor: 5,
};

describe("notebook", () => {
  it("bolak-balik tanpa perubahan untuk notebook berformat Jupyter", () => {
    const text = JSON.stringify(NB, null, 1) + "\n";
    const nb = parseNotebook(text);
    expect(nb.cells[0]).toMatchObject({ cell_type: "markdown", source: "# Judul\nteks" });
    expect(nb.cells[1]).toMatchObject({ source: "print('halo')\n1+2", execution_count: 2 });
    expect(serializeNotebook(nb)).toBe(text);
  });
  it("memberi id pada sel lama dan notebook kosong", () => {
    const nb = parseNotebook(JSON.stringify({ cells: [{ cell_type: "code", source: "x", metadata: {}, outputs: [] }], metadata: {}, nbformat: 4, nbformat_minor: 2 }));
    expect(nb.cells[0].id).toMatch(/^\w{8,}$/);
    expect(parseNotebook("").cells).toHaveLength(1);
    expect(() => parseNotebook('{"a":1}')).toThrow();
  });
  it("utilitas output", () => {
    expect(toLines("a\nb\n")).toEqual(["a\n", "b\n"]);
    expect(toLines("a\nb")).toEqual(["a\n", "b"]);
    expect(stripAnsi("\u001b[0;31mError\u001b[0m")).toBe("Error");
    expect(appendOutput([{ output_type: "stream", name: "stdout", text: "a" }], { output_type: "stream", name: "stdout", text: "b" })).toEqual([{ output_type: "stream", name: "stdout", text: "ab" }]);
  });
});
