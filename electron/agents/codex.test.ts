import { describe, expect, it } from "vitest";
import { changeDiff, codexPolicy, itemInput, parseError, sandboxPolicy } from "./codex";

describe("Codex app-server", () => {
  it("mode panel → kebijakan Codex", () => {
    expect(codexPolicy("untrusted")).toEqual({ approvalPolicy: "untrusted", sandbox: "workspace-write" });
    expect(codexPolicy("read-only")).toEqual({ approvalPolicy: "on-request", sandbox: "read-only" });
    expect(codexPolicy("apa-saja")).toEqual({ approvalPolicy: "untrusted", sandbox: "workspace-write" });
  });
  it("kebijakan sandbox: workspaceWrite mengizinkan akses jaringan, readOnly tidak", () => {
    expect(sandboxPolicy("workspace-write", "/test")).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/test"],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });
    expect(sandboxPolicy("read-only", "/test")).toEqual({
      type: "readOnly",
      networkAccess: false,
    });
  });
  it("isi berkas baru jadi baris tambah; unified diff dibiarkan", () => {
    expect(changeDiff({ kind: { type: "add" }, diff: "halo\ndunia\n" })).toBe("+halo\n+dunia");
    expect(changeDiff({ kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b" })).toBe("@@ -1 +1 @@\n-a\n+b");
  });
  it("item perintah & perubahan berkas jadi input kartu", () => {
    expect(itemInput({ type: "commandExecution", command: "ls", cwd: "/x" })).toEqual({ command: "ls", cwd: "/x" });
    const f = itemInput({ type: "fileChange", changes: [{ path: "/p/a.txt", kind: { type: "add" }, diff: "hi" }] });
    expect(f.file_path).toBe("/p/a.txt");
    expect(f.diff).toBe("+hi");
  });
  it("pesan error API diringkas", () => {
    expect(parseError('{"type":"error","error":{"message":"Model tidak didukung"}}')).toBe("Model tidak didukung");
    expect(parseError("biasa")).toBe("biasa");
  });
});

import { effortFor } from "./codex";
describe("effort Codex per model", () => {
  it("hanya mengirim effort yang didukung model", () => {
    expect(effortFor("ultra", ["low", "medium", "high", "xhigh", "max", "ultra"])).toBe("ultra");
    expect(effortFor("ultra", ["low", "medium", "high", "max"])).toBeUndefined();
    expect(effortFor(null, ["low"])).toBeUndefined();
    expect(effortFor("high", undefined)).toBe("high"); // daftar belum diketahui: kirim apa adanya
  });
});
