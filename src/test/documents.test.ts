// Dokumen terbuka: dedupe openDocument bersamaan dan sambung ulang ekstensi berpath setelah rename.
import { StateField } from "@codemirror/state";
import { undo, undoDepth } from "@codemirror/commands";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Lingkungan tes tanpa DOM: cukup yang dibaca saat membuat EditorState.
  const g = globalThis as Record<string, unknown>;
  g.document ??= { documentElement: { dataset: {} } };
  g.window ??= globalThis;
  g.requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
});

afterEach(() => vi.restoreAllMocks());

const file = (content: string) => ({ content, mtime_ms: 1, eol: "lf" as const });

describe("openDocument", () => {
  it("pemanggilan bersamaan untuk path yang sama menghasilkan satu Doc", async () => {
    const { api } = await import("../lib/ipc");
    const docs = await import("../editor/documents");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const read = vi.spyOn(api, "readText").mockImplementation(async () => {
      await gate;
      return file("halo");
    });
    const a = docs.openDocument("/p/dedupe.txt");
    const b = docs.openDocument("/p/dedupe.txt");
    release();
    const [da, db] = await Promise.all([a, b]);
    expect(da).toBe(db);
    expect(read).toHaveBeenCalledTimes(1);
    expect(docs.getDoc("/p/dedupe.txt")).toBe(da);
    // Setelah selesai, pemanggilan berikutnya langsung dari cache.
    expect(await docs.openDocument("/p/dedupe.txt")).toBe(da);
    expect(read).toHaveBeenCalledTimes(1);
    docs.closeDocument("/p/dedupe.txt");
  });

  it("pembacaan gagal tidak mengunci path (bisa dicoba lagi)", async () => {
    const { api } = await import("../lib/ipc");
    const docs = await import("../editor/documents");
    const read = vi.spyOn(api, "readText").mockRejectedValueOnce(new Error("EACCES")).mockResolvedValueOnce(file("ok"));
    await expect(docs.openDocument("/p/gagal.txt")).rejects.toThrow("EACCES");
    const d = await docs.openDocument("/p/gagal.txt");
    expect(d.saved.toString()).toBe("ok");
    expect(read).toHaveBeenCalledTimes(2);
    docs.closeDocument("/p/gagal.txt");
  });
});

describe("renameDocument", () => {
  it("ekstensi berpath pindah ke path baru tanpa kehilangan isi, seleksi, dan undo", async () => {
    const { api } = await import("../lib/ipc");
    const docs = await import("../editor/documents");
    const { blamePath } = await import("../editor/blame");
    const { dbg, setDbg } = await import("../debug/state");
    vi.spyOn(api, "readText").mockResolvedValue(file("satu\ndua"));
    const doc = await docs.openDocument("/p/lama.txt");
    // Tiruan koneksi LSP yang terikat ke URI lama.
    const fakeLsp = StateField.define({ create: () => "file:///p/lama.txt", update: (v) => v });
    doc.lsp = fakeLsp;
    doc.lspGroup = 0;
    let st = docs.stateFor(doc, 0);
    expect(st.field(fakeLsp, false)).toBe("file:///p/lama.txt");
    expect(st.facet(blamePath)).toBe("/p/lama.txt");
    st = st.update({ changes: { from: 0, insert: "nol\n" }, selection: { anchor: 2 }, userEvent: "input.type" }).state;
    doc.states[0] = st;
    setDbg((s) => ({ breakpoints: { ...s.breakpoints, "/p/lama.txt": [{ line: 2 }] } }));

    docs.renameDocument("/p/lama.txt", "/p/baru.ts");

    const after = doc.states[0]!;
    expect(docs.getDoc("/p/baru.ts")).toBe(doc);
    expect(docs.getDoc("/p/lama.txt")).toBeUndefined();
    expect(after.doc.toString()).toBe("nol\nsatu\ndua");
    expect(after.selection.main.anchor).toBe(2);
    expect(undoDepth(after)).toBe(1);
    expect(after.facet(blamePath)).toBe("/p/baru.ts");
    // Koneksi LSP lama dilepas (didClose); attachLsp memasang ulang dengan URI baru bila ada server.
    expect(after.field(fakeLsp, false)).toBeUndefined();
    expect(doc.lsp).toBeNull();
    expect(doc.langId).toBe("ts");
    expect(dbg().breakpoints["/p/baru.ts"]).toEqual([{ line: 2 }]);
    expect(dbg().breakpoints["/p/lama.txt"]).toBeUndefined();

    // Undo masih bekerja di state hasil rename.
    let undone = after;
    undo({ state: after, dispatch: (tr) => (undone = tr.state) });
    expect(undone.doc.toString()).toBe("satu\ndua");
    docs.closeDocument("/p/baru.ts");
  });
});
