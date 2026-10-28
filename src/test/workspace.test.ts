import { describe, expect, it } from "vitest";
import { workspaceFolders } from "../app/actions";
import { normalizePath } from "../lib/paths";

describe("workspace multi-root", () => {
  it("folder .code-workspace relatif/absolut, komentar & koma akhir, tanpa duplikat", () => {
    const text = `{
      // komentar
      "folders": [{ "path": "web" }, { "path": "./api" }, { "path": "../lain" }, { "path": "/abs/x" }, { "path": "web" }, { "name": "tanpa path" }],
    }`;
    expect(workspaceFolders("/home/u/proj/p.code-workspace", text)).toEqual(["/home/u/proj/web", "/home/u/proj/api", "/home/u/lain", "/abs/x"]);
    expect(workspaceFolders("C:/w/p.code-workspace", `{"folders":[{"path":"a\\\\b"}]}`)).toEqual(["C:/w/a/b"]);
    expect(workspaceFolders("/x/p.code-workspace", "rusak")).toEqual([]);
  });
  it("normalizePath", () => {
    expect(normalizePath("/a/./b/../c")).toBe("/a/c");
    expect(normalizePath("C:/a/../b")).toBe("C:/b");
  });
});

import { isFolderTrusted } from "../app/workspaceTrust";

describe("workspace trust", () => {
  it("folder dipercaya juga mempercayai sub-folder, bukan folder bersebelahan", () => {
    const t = ["/home/u/kerja"];
    expect(isFolderTrusted("/home/u/kerja", t)).toBe(true);
    expect(isFolderTrusted("/home/u/kerja/app", t)).toBe(true);
    expect(isFolderTrusted("/home/u/kerjaan", t)).toBe(false);
    expect(isFolderTrusted("/home/u", t)).toBe(false);
  });
});
