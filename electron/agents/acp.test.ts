import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toolInput } from "./acp";
import { agyArgs, agyInput } from "./antigravity";
import { extractTar } from "./install";

function tarEntry(name: string, body: string): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0);
  h.write("0000644\0", 100);
  h.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
  h.write("0", 156);
  const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  data.write(body);
  return Buffer.concat([h, data]);
}

describe("agen ACP & Antigravity", () => {
  it("tool_call ACP → input kartu (perintah, berkas, diff)", () => {
    expect(toolInput({ kind: "execute", title: "ls", rawInput: { command: "ls -la" } })).toMatchObject({ command: "ls -la" });
    const e = toolInput({ kind: "edit", title: "Edit", content: [{ type: "diff", path: "/p/a.ts", oldText: "a", newText: "b" }] });
    expect(e).toMatchObject({ file_path: "/p/a.ts", before: "a", after: "b" });
  });
  it("argumen agy mengikuti mode, model, effort, percakapan", () => {
    const a = agyArgs({ cwd: "/x", model: "gemini-3.8-flash-high", effort: "low", mode: "plan", resume: "abc" });
    expect(a.join(" ")).toContain("--mode plan");
    expect(a.join(" ")).toContain("--model gemini-3.8-flash-high");
    expect(a.join(" ")).toContain("--conversation abc");
    expect(a[a.length - 1]).toBe("--print=");
    expect(agyArgs({ cwd: "/x", model: null, effort: null, mode: "strict", resume: null })).not.toContain("--mode");
    expect(agyInput({ TargetFile: "/p/x.txt" })).toEqual({ file_path: "/p/x.txt" });
    expect(agyInput({ CommandLine: "npm test" })).toEqual({ command: "npm test" });
  });
  it("ekstrak tar npm: hanya berkas yang dipilih, path aman", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-tar-"));
    const tar = Buffer.concat([tarEntry("package/bundle/gemini.js", "console.log(1)"), tarEntry("package/README.md", "x"), tarEntry("../evil.js", "x"), Buffer.alloc(1024)]);
    const n = extractTar(tar, dir, (name) => name.startsWith("package/bundle/") || name === "../evil.js");
    expect(n).toBe(1);
    expect(fs.readFileSync(path.join(dir, "package/bundle/gemini.js"), "utf8")).toBe("console.log(1)");
    expect(fs.existsSync(path.join(dir, "..", "evil.js"))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
