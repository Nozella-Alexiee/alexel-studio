import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claudeSessionLoad, claudeSessionsList, parseCliHelp, projectSessionDirs, promptTitle, sanitizeCfg, sessionArgs } from "./claude";

describe("sesi Claude Code", () => {
  it("argumen CLI mengikuti model, effort, mode, dan resume", () => {
    const a = sessionArgs(sanitizeCfg({ cwd: "/x", model: "sonnet", effort: "low", mode: "plan", resume: "abc-123" }));
    expect(a).toContain("--include-partial-messages");
    expect(a.join(" ")).toContain("--permission-mode plan");
    expect(a.join(" ")).toContain("--model sonnet");
    expect(a.join(" ")).toContain("--effort low");
    expect(a.join(" ")).toContain("--resume abc-123");
  });
  it("nilai tidak dikenal dibuang", () => {
    const c = sanitizeCfg({ cwd: "/x", model: "default", effort: "turbo", mode: "yolo" as never, resume: "../../etc" });
    expect(c).toEqual({ cwd: "/x", model: null, effort: null, mode: "default", resume: null, ultracode: false, allowDangerous: false });
    expect(sessionArgs(c).join(" ")).not.toContain("--model");
  });
  it("mode auto diterima; bypassPermissions hanya bila diizinkan, dan flag peluncuran ikut", () => {
    expect(sanitizeCfg({ cwd: "/x", mode: "auto" }).mode).toBe("auto");
    expect(sanitizeCfg({ cwd: "/x", mode: "bypassPermissions" }).mode).toBe("default");
    const ok = sanitizeCfg({ cwd: "/x", mode: "bypassPermissions", allowDangerous: true });
    expect(ok.mode).toBe("bypassPermissions");
    expect(sessionArgs(ok)).toContain("--allow-dangerously-skip-permissions");
    expect(sessionArgs(sanitizeCfg({ cwd: "/x" }))).not.toContain("--allow-dangerously-skip-permissions");
  });
  it("ultracode hanya boolean true", () => {
    expect(sanitizeCfg({ cwd: "/x", ultracode: true }).ultracode).toBe(true);
    expect(sanitizeCfg({ cwd: "/x", ultracode: "yes" as never }).ultracode).toBe(false);
  });
  it("pilihan CLI dibaca dari --help (baris dipatahkan)", () => {
    const help = `  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")`;
    expect(parseCliHelp(help)).toEqual({ efforts: ["low", "medium", "high", "xhigh", "max"], permissionModes: ["acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"] });
    expect(parseCliHelp("tidak ada")).toEqual({ efforts: [], permissionModes: [] });
  });
  it("judul diambil dari permintaan, bukan blok konteks", () => {
    expect(promptTitle("### Berkas a.ts\n```\nx\n```\n\n### Permintaan\nRapikan   fungsi ini")).toBe("Rapikan fungsi ini");
    expect(promptTitle([{ type: "image" }, { type: "text", text: "Lihat gambar" }])).toBe("Lihat gambar");
    expect(promptTitle("<command-name>/clear</command-name>")).toBe("");
  });
  it("daftar & muat riwayat dari folder projects", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "alexel-claude-"));
    const cwd = "/Users/demo/my.app";
    const dir = path.join(base, "-Users-demo-my-app");
    fs.mkdirSync(dir);
    const lines = [
      { type: "user", message: { role: "user", content: "### Permintaan\nTambah tombol" } },
      { type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Sudah." }] } },
      { type: "assistant", isSidechain: true, message: { content: [] } },
    ];
    fs.writeFileSync(path.join(dir, "1111-aaaa.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
    expect(projectSessionDirs(cwd, base)).toEqual([dir]);
    const list = claudeSessionsList(cwd, base);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "1111-aaaa", title: "Tambah tombol", messages: 2 });
    expect(claudeSessionLoad(cwd, "1111-aaaa", base)).toHaveLength(2);
    expect(() => claudeSessionLoad(cwd, "../x", base)).toThrow();
    fs.rmSync(base, { recursive: true, force: true });
  });
});

