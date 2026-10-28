import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { checkVersion, installedAgent, openVsxTarget, pickEntries, PACKAGES, readZipEntries, safeEntryName, safeJoin } from "./install";

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
  it("menolak nama entri berbahaya (pemisah \\ maupun /)", () => {
    expect(safeEntryName("extension/bin/x")).toBe(true);
    expect(safeEntryName("extension/bin/windows-x86_64/..\\..\\..\\evil.dll")).toBe(false);
    expect(safeEntryName("package/bundle/../x")).toBe(false);
    expect(safeEntryName("/etc/passwd")).toBe(false);
    expect(safeEntryName("\\evil")).toBe(false);
    expect(safeEntryName("C:/evil")).toBe(false);
    const names = ["extension/bin/windows-x86_64/..\\..\\..\\evil.dll", "extension/bin/windows-x86_64/codex.exe"].map((name) => ({ name }));
    expect(pickEntries(names, PACKAGES.codex.pick("win32-x64"))).toEqual(["extension/bin/windows-x86_64/codex.exe"]);
    const dest = path.join(os.tmpdir(), "alexel-dest");
    expect(safeJoin(dest, "a/b")).toBe(path.join(dest, "a", "b"));
    expect(() => safeJoin(dest, "../x")).toThrow();
  });
  it("versi registry divalidasi sebelum jadi nama folder", () => {
    expect(checkVersion("2.1.300")).toBe("2.1.300");
    expect(checkVersion("0.40.0-preview.1")).toBe("0.40.0-preview.1");
    expect(() => checkVersion("..")).toThrow();
    expect(() => checkVersion("../../x")).toThrow();
    expect(() => checkVersion(42)).toThrow();
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

  it("mendeteksi biner Claude dari ekstensi di userData/extensions", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-inst-"));
    const extDir = path.join(tmp, "extensions", "Anthropic.claude-code", "ext", "resources", "native-binary");
    fs.mkdirSync(extDir, { recursive: true });
    const dummy = path.join(extDir, process.platform === "win32" ? "claude.exe" : "claude");
    fs.writeFileSync(dummy, "#!/bin/sh\n", { mode: 0o755 });
    const res = installedAgent({ userData: tmp } as any, "claude");
    expect(res).not.toBeNull();
    expect(res?.version).toBe("extension");
    expect(res?.binary).toBe(dummy);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
