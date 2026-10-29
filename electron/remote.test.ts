import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Ctx } from "./util";
import { fromMirror, mirrorPath, parseSshConfig, sq, terminalCommand, validTarget } from "./remote";

describe("remote ssh", () => {
  it("membaca ~/.ssh/config", () => {
    const hosts = parseSshConfig(`Host *\n  ServerAliveInterval 30\nHost prod web-1\n  HostName 10.0.0.5\n  User deploy\n  Port 2200\n# komentar\nHost dev\n  HostName=dev.local\nMatch host x\n  User nope\n`);
    expect(hosts).toEqual([
      { target: "prod", hostname: "10.0.0.5", user: "deploy", port: 2200, source: "config" },
      { target: "web-1", hostname: "10.0.0.5", user: "deploy", port: 2200, source: "config" },
      { target: "dev", hostname: "dev.local", source: "config" },
    ]);
  });
  it("menolak target yang bisa jadi opsi ssh", () => {
    expect(validTarget("nozi@10.0.0.1:2222")).toBe(true);
    expect(validTarget("prod")).toBe(true);
    expect(validTarget("-oProxyCommand=sh")).toBe(false);
    expect(validTarget("a b")).toBe(false);
    expect(validTarget("host;rm")).toBe(false);
  });
  it("kutip shell & perintah terminal", () => {
    expect(sq("it's")).toBe(`'it'\\''s'`);
    const cmd = terminalCommand("nozi@h:2222", "/srv/app");
    expect(cmd).toContain("-p 2222 nozi@h");
    expect(cmd).not.toContain("BatchMode");
    expect(cmd).toContain(`'cd '\\''/srv/app'\\'' 2>/dev/null; exec "$SHELL" -l'`);
  });
  it("salinan lokal bolak-balik dan menolak ..", () => {
    const ctx = { userData: fs.mkdtempSync(path.join(os.tmpdir(), "alexel-rm-")) } as unknown as Ctx;
    const local = mirrorPath(ctx, "nozi@h:2222", "/srv/app/main.py");
    expect(fromMirror(ctx, local)).toEqual({ target: "nozi@h:2222", remote: "/srv/app/main.py" });
    expect(fromMirror(ctx, "/etc/passwd")).toBeNull();
    // ".." dinormalisasi: tidak pernah keluar dari folder salinan.
    expect(mirrorPath(ctx, "h", "/a/../../etc").startsWith(path.join(ctx.userData, "remote"))).toBe(true);
  });
});
