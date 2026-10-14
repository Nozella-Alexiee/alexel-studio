import { describe, expect, it } from "vitest";
import { diffStats, lineChanges } from "../lib/diff";
import { fuzzyFilter, fuzzyScore } from "../lib/fuzzy";
import { basename, dirname, extname, isInside, join, relative, validateName } from "../lib/paths";
import { formatBytes, stripAnsi, timeAgo } from "../lib/format";

describe("paths", () => {
  it("memecah dan menggabung path", () => {
    expect(basename("/a/b/c.ts")).toBe("c.ts");
    expect(dirname("/a/b/c.ts")).toBe("/a/b");
    expect(dirname("/a")).toBe("/");
    expect(join("/a/", "/b", "c")).toBe("/a/b/c");
    expect(extname("/x/Makefile")).toBe("");
    expect(extname("/x/a.TSX")).toBe("tsx");
    expect(relative("/p", "/p/src/a.ts")).toBe("src/a.ts");
    expect(isInside("/p", "/p2/a")).toBe(false);
    expect(isInside("/p", "/p/a")).toBe(true);
  });
  it("menolak nama berkas berbahaya", () => {
    expect(validateName("../x")).not.toBeNull();
    expect(validateName("a/b")).not.toBeNull();
    expect(validateName("  ")).not.toBeNull();
    expect(validateName("..")).not.toBeNull();
    expect(validateName("ok.ts")).toBeNull();
  });
});

describe("diff", () => {
  it("menandai baris tambah, ubah, hapus", () => {
    const a = "satu\ndua\ntiga\nempat\n";
    expect(lineChanges(a, a)).toEqual([]);
    expect(lineChanges(a, "satu\ndua\nBARU\ntiga\nempat\n")).toEqual([{ type: "add", from: 3, to: 3 }]);
    expect(lineChanges(a, "satu\nDUA\ntiga\nempat\n")).toEqual([{ type: "mod", from: 2, to: 2 }]);
    expect(lineChanges(a, "satu\ntiga\nempat\n")).toEqual([{ type: "del", at: 2 }]);
  });
  it("menghitung statistik", () => {
    expect(diffStats("a\nb\nc", "a\nx\nc\nd")).toEqual({ added: 2, removed: 1 });
    expect(diffStats("", "a\nb")).toEqual({ added: 2, removed: 0 });
    expect(diffStats("a\nb", "")).toEqual({ added: 0, removed: 2 });
  });
  it("stabil pada dokumen acak", () => {
    for (let n = 0; n < 40; n++) {
      const a = Array.from({ length: 30 }, () => String(Math.floor(Math.random() * 6)));
      const b = a.filter(() => Math.random() > 0.2).concat(Math.random() > 0.5 ? ["z"] : []);
      const st = diffStats(a.join("\n"), b.join("\n"));
      // panjang baru = lama - dihapus + ditambah
      expect(a.length - st.removed + st.added).toBe(b.length);
    }
  });
});

describe("fuzzy", () => {
  it("mengutamakan nama berkas dan huruf berurutan", () => {
    const files = ["src/app/actions.ts", "src/editor/documents.ts", "docs/README.md", "src/app/commands.ts"];
    expect(fuzzyFilter("doc", files, (f) => f)[0].item).toBe("src/editor/documents.ts");
    expect(fuzzyFilter("cmd", files, (f) => f)[0].item).toBe("src/app/commands.ts");
    expect(fuzzyScore("xyz", "abc")).toBeNull();
    expect(fuzzyScore("ac", "actions")!.positions).toEqual([0, 1]);
  });
});

describe("format", () => {
  it("memformat ukuran, waktu, dan membuang ANSI", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(timeAgo(Date.now())).toBe("baru saja");
    expect(timeAgo(Date.now() - 3 * 60_000)).toBe("3 mnt lalu");
    expect(stripAnsi("\x1b[32mok\x1b[0m\r\n")).toBe("ok\r\n");
  });
});
