import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractServer, MANAGED, managedInstall, managedInstalled, managedRemove } from "./managedServers";
import { serverFor } from "./extCompat";
import type { Ctx } from "./util";

afterEach(() => vi.unstubAllGlobals());
const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-srv-")));
const ctxFor = (userData: string) => ({ userData }) as unknown as Ctx;

describe("registry server terkurasi", () => {
  it("tiap entri lengkap: sha256 64-hex, entry di dalam awalan ekstrak, id unik", () => {
    expect(new Set(MANAGED.map((s) => s.id)).size).toBe(MANAGED.length);
    for (const s of MANAGED) {
      expect(s.vsix.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.vsix.version).toMatch(/^\d/);
      expect(s.extract.some((p) => s.entry.startsWith(p)), `${s.id}: entry di luar awalan`).toBe(true);
      expect(s.entry.startsWith("..")).toBe(false);
      expect(s.langs.length).toBeGreaterThan(0);
    }
  });

  it("ekstensi katalog dipetakan ke servernya", () => {
    expect(serverFor("Prisma.prisma")).toBe("prisma");
    expect(serverFor("redhat.vscode-yaml")).toBe("yaml");
    expect(serverFor("some.other")).toBeNull();
  });
});

describe("ekstraksi aman", () => {
  const vsix = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

  it("hanya awalan yang diminta yang diekstrak (extension.js tidak)", () => {
    const dir = tmp();
    const n = extractServer(vsix({ "extension/dist/server.js": "s", "extension/dist/extension.js": "e", "extension/other/x.js": "x", "extension/package.json": "{}" }), dir, ["dist/server"]);
    expect(n).toBe(1);
    expect(fs.readdirSync(path.join(dir, "dist"))).toEqual(["server.js"]);
  });

  it("path keluar folder ditolak", () => {
    const dir = tmp();
    expect(() => extractServer(vsix({ "extension/dist/../../evil.js": "x" }), dir, ["dist/"])).toThrow(/tidak aman|tidak berisi/);
    expect(fs.existsSync(path.join(dir, "..", "evil.js"))).toBe(false);
  });

  it("tanpa berkas cocok = galat", () => {
    expect(() => extractServer(vsix({ "extension/a.js": "x" }), tmp(), ["dist/"])).toThrow(/tidak berisi/);
  });
});

describe("pasang server (fetch dimock)", () => {
  const s = MANAGED[0];
  const pkg = zipSync({ [`extension/${s.entry}`]: strToU8("console.log(1)"), "extension/dist/extension.js": strToU8("jangan"), "extension/dist/l10n/bundle.l10n.json": strToU8("{}") });
  const stub = (data: Uint8Array) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith(".vsix") ? new Response(new Blob([data as Uint8Array<ArrayBuffer>])) : new Response(JSON.stringify({ files: { download: "https://open-vsx.org/api/x/y/1/file/x.y-1.vsix" } }))))
    );

  it("checksum tidak cocok dengan pin: ditolak, tidak ada folder tersisa", async () => {
    const ud = tmp();
    stub(pkg);
    await expect(managedInstall(ctxFor(ud), s.id)).rejects.toThrow(/checksum/i);
    expect(fs.existsSync(path.join(ud, "servers")) ? fs.readdirSync(path.join(ud, "servers")) : []).toEqual([]);
    expect(managedInstalled(ctxFor(ud), s)).toBeNull();
  });

  it("checksum cocok: terpasang, hanya berkas server, dan bisa dihapus", async () => {
    const ud = tmp();
    // Pin sementara untuk paket uji.
    const orig = s.vsix.sha256;
    s.vsix.sha256 = createHash("sha256").update(pkg).digest("hex");
    try {
      stub(pkg);
      const r = await managedInstall(ctxFor(ud), s.id);
      expect(r.version).toBe(s.vsix.version);
      const inst = managedInstalled(ctxFor(ud), s)!;
      expect(fs.readFileSync(inst.entry, "utf8")).toBe("console.log(1)");
      expect(fs.existsSync(path.join(inst.dir, "dist", "extension.js"))).toBe(false);
      managedRemove(ctxFor(ud), s.id);
      expect(managedInstalled(ctxFor(ud), s)).toBeNull();
    } finally {
      s.vsix.sha256 = orig;
    }
  });
});
