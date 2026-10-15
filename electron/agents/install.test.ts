import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { openVsxTarget, pickEntries, PACKAGES, readZipEntries } from "./install";

describe("pasang agen dari VSIX", () => {
  it("target platform Open VSX", () => {
    expect(openVsxTarget("darwin", "arm64")).toBe("darwin-arm64");
    expect(openVsxTarget("win32", "x64")).toBe("win32-x64");
    expect(openVsxTarget("linux", "arm64")).toBe("linux-arm64");
  });
  it("hanya biner agen yang diambil, JS ekstensi tidak", () => {
    const names = ["extension/extension.js", "extension/resources/native-binary/claude", "extension/bin/macos-aarch64/codex", "extension/bin/macos-aarch64/rg", "extension/bin/linux-x86_64/codex", "extension/../evil", "extension/bin/macos-aarch64/"];
    const e = names.map((name) => ({ name }));
    expect(pickEntries(e, PACKAGES.claude.pick("darwin-arm64"))).toEqual(["extension/resources/native-binary/claude"]);
    expect(pickEntries(e, PACKAGES.codex.pick("darwin-arm64"))).toEqual(["extension/bin/macos-aarch64/codex", "extension/bin/macos-aarch64/rg"]);
    expect(PACKAGES.codex.binary("win32-x64")).toBe("bin/windows-x86_64/codex.exe");
  });
  it("membaca daftar isi zip tanpa memuat seluruh berkas", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-zip-"));
    const file = path.join(dir, "a.vsix");
    fs.writeFileSync(file, zipSync({ "extension/extension.js": new TextEncoder().encode("x"), "extension/resources/native-binary/claude": new Uint8Array(1000) }));
    const fd = fs.openSync(file, "r");
    const list = readZipEntries(fd, fs.statSync(file).size);
    fs.closeSync(fd);
    expect(list.map((x) => x.name).sort()).toEqual(["extension/extension.js", "extension/resources/native-binary/claude"]);
    expect(list.find((x) => x.name.endsWith("claude"))?.usize).toBe(1000);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
