import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appRoot } from "./api";

const key = `${process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux"}-${process.arch}`;
const exe = path.join(__dirname, "..", "..", "vendor", "ripgrep", key, process.platform === "win32" ? "rg.exe" : "rg");

describe("appRoot (ripgrep bawaan)", () => {
  const prev = process.env.NOZEL_RIPGREP;
  afterEach(() => {
    if (prev === undefined) delete process.env.NOZEL_RIPGREP;
    else process.env.NOZEL_RIPGREP = prev;
  });

  it.skipIf(!fs.existsSync(exe))("menautkan rg bawaan ke @vscode/ripgrep/bin dan bisa dijalankan", () => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), "approot-"));
    process.env.NOZEL_RIPGREP = exe;
    const root = appRoot({ userData: ud });
    const link = path.join(root, "node_modules", "@vscode", "ripgrep", "bin", path.basename(exe));
    expect(fs.existsSync(link)).toBe(true);
    expect(execFileSync(link, ["--version"]).toString()).toMatch(/^ripgrep \d+\./);
  });
});
