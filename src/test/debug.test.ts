import { describe, expect, it } from "vitest";
import { kindOf, parseJsonc, substitute } from "../debug/debug";

describe("konfigurasi debug", () => {
  it("launch.json dengan komentar & koma berlebih", () => {
    const j = parseJsonc(`{
      // komentar
      "version": "0.2.0",
      /* blok */
      "configurations": [{ "name": "a // bukan komentar", "type": "node", "request": "launch", },],
    }`) as { configurations: { name: string }[] };
    expect(j.configurations[0].name).toBe("a // bukan komentar");
  });
  it("variabel ${...} diganti", () => {
    expect(substitute({ program: "${workspaceFolder}/src/${fileBasename}", args: ["${file}"] }, { workspaceFolder: "/p", fileBasename: "a.js", file: "/p/a.js" })).toEqual({ program: "/p/src/a.js", args: ["/p/a.js"] });
    expect(substitute("${tidakAda}", {})).toBe("${tidakAda}");
  });
  it("tipe VS Code → adapter", () => {
    expect(kindOf("node")).toBe("node");
    expect(kindOf("pwa-node")).toBe("node");
    expect(kindOf("debugpy")).toBe("python");
    expect(kindOf("lldb")).toBe("lldb");
    expect(kindOf("chrome")).toBeNull();
  });
});
