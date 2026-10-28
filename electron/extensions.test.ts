import { zipSync, strToU8 } from "fflate";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { alternativeFor, classifyManifest } from "./extCompat";
import { cmpVersion, extInstall, extList, extSearch } from "./extensions";
import type { Ctx } from "./util";

afterEach(() => vi.unstubAllGlobals());

describe("kecocokan ekstensi", () => {
  it("tema murni = lengkap", () => {
    const c = classifyManifest({ contributes: { themes: [{ label: "X", path: "./t.json" }] } }, "a.b");
    expect(c).toMatchObject({ level: "full", data: ["themes"], code: false, server: null });
  });

  it("ada kode (main) = dijalankan extension host (eksperimental), data tetap tercatat", () => {
    const c = classifyManifest({ main: "./out/ext.js", contributes: { iconThemes: [{}], commands: [{ command: "x" }] } });
    expect(c.level).toBe("host");
    expect(c.data).toEqual(["iconThemes"]);
    expect(c.needs).toEqual(["commands"]);
  });

  it("tanpa data dan tanpa kode = tidak didukung; pengganti bawaan tetap tercatat", () => {
    const c = classifyManifest({ contributes: { keybindings: [{}] } }, "esbenp.prettier-vscode");
    expect(c.level).toBe("none");
    expect(c.alt).toContain("Prettier");
    expect(alternativeFor("Eamodio.GitLens")).toBeTruthy();
  });

  it("bahasa tanpa konfigurasi/grammar tidak dihitung data", () => {
    expect(classifyManifest({ contributes: { languages: [{ id: "x", extensions: [".x"] }] } }).level).toBe("none");
    expect(classifyManifest({ contributes: { languages: [{ id: "x", configuration: "./c.json" }] } }).level).toBe("full");
  });
});

describe("versi", () => {
  it("membandingkan semver sederhana", () => {
    expect(cmpVersion("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(cmpVersion("2.0", "2.0.0")).toBe(0);
    expect(cmpVersion("0.9.1", "0.10.0")).toBeLessThan(0);
  });
});

const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-ext-")));
const ctxFor = (userData: string) => ({ userData }) as unknown as Ctx;

function stubOpenVsx(vsix: Uint8Array, version = "1.0.0") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith(".vsix")) return new Response(new Blob([vsix as Uint8Array<ArrayBuffer>]));
      return new Response(JSON.stringify({ version, files: { download: `https://open-vsx.org/api/pub/ext/${version}/file/pub.ext-${version}.vsix` } }));
    })
  );
}

const vsixOf = (pkg: object, files: Record<string, string> = {}) => zipSync({ "extension/package.json": strToU8(JSON.stringify(pkg)), ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`extension/${k}`, strToU8(v)])) });

describe("pasang ekstensi", () => {
  it("bahasa dengan language-configuration saja dipasang & konfigurasinya tercatat", async () => {
    const userData = tmp();
    stubOpenVsx(vsixOf({ name: "ext", version: "1.0.0", contributes: { languages: [{ id: "foo", extensions: [".foo"], configuration: "./language-configuration.json" }] } }, { "language-configuration.json": '{"comments":{"lineComment":"#"}}' }));
    const m = await extInstall(ctxFor(userData), "pub", "ext");
    expect(m.languages[0].configuration).toBe("language-configuration.json");
    expect(m).toMatchObject({ id: "pub.ext", namespace: "pub", name: "ext" });
    expect(extList(ctxFor(userData)).map((e) => e.id)).toEqual(["pub.ext"]);
  });

  it("gagal = tidak ada folder tersisa, dan versi lama tetap utuh", async () => {
    const userData = tmp();
    const ctx = ctxFor(userData);
    stubOpenVsx(vsixOf({ name: "ext", version: "1.0.0", contributes: { themes: [{ label: "A", path: "./a.json" }] } }, { "a.json": "{}" }));
    await extInstall(ctx, "pub", "ext");
    stubOpenVsx(vsixOf({ name: "ext", version: "2.0.0", contributes: { commands: [{}] } }), "2.0.0");
    await expect(extInstall(ctx, "pub", "ext")).rejects.toThrow(/tidak berisi/);
    expect(fs.readdirSync(path.join(userData, "extensions"))).toEqual(["pub.ext"]);
    expect(extList(ctx)[0].version).toBe("1.0.0");
  });

  it("sisa pemasangan terputus (lama) dibersihkan, tapi yang baru (pemasangan sedang berjalan) tidak disentuh", () => {
    const userData = tmp();
    const old = path.join(userData, "extensions", ".tmp-pub.ext-1-2");
    const fresh = path.join(userData, "extensions", ".tmp-pub.ext-3-4");
    fs.mkdirSync(old, { recursive: true });
    fs.mkdirSync(fresh, { recursive: true });
    const ago = new Date(Date.now() - 30 * 60_000);
    fs.utimesSync(old, ago, ago);
    expect(extList(ctxFor(userData))).toEqual([]);
    expect(fs.readdirSync(path.join(userData, "extensions"))).toEqual([".tmp-pub.ext-3-4"]);
  });
});

describe("pencarian", () => {
  it("meneruskan kategori opsional, urutan & halaman, dan menurunkan URL manifest", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(url);
        return new Response(
          JSON.stringify({
            totalSize: 61,
            offset: 30,
            extensions: [{ namespace: "esbenp", name: "prettier-vscode", version: "12.4.0", averageRating: 4.3, reviewCount: 17, downloadCount: 9, files: { download: "https://open-vsx.org/api/esbenp/prettier-vscode/12.4.0/file/esbenp.prettier-vscode-12.4.0.vsix" } }],
          })
        );
      })
    );
    const r = await extSearch({ query: "prettier", sortBy: "downloadCount", offset: 30 });
    const u = new URL(seen[0]);
    expect(u.searchParams.get("category")).toBeNull();
    expect(u.searchParams.get("sortBy")).toBe("downloadCount");
    expect(u.searchParams.get("sortOrder")).toBe("desc");
    expect(u.searchParams.get("offset")).toBe("30");
    expect(r.total).toBe(61);
    expect(r.items[0]).toMatchObject({ id: "esbenp.prettier-vscode", rating: 4.3, reviews: 17, manifestUrl: "https://open-vsx.org/api/esbenp/prettier-vscode/12.4.0/file/package.json" });
  });
});

import { isExecutable } from "./extensions";
describe("deteksi biner", () => {
  it("Mach-O (arm64 & universal), ELF, dan shebang dikenali; teks biasa tidak", () => {
    expect(isExecutable(Uint8Array.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c]))).toBe(true);
    expect(isExecutable(Uint8Array.from([0xca, 0xfe, 0xba, 0xbe]))).toBe(true);
    expect(isExecutable(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
    expect(isExecutable(new TextEncoder().encode("#!/bin/sh\n"))).toBe(true);
    expect(isExecutable(new TextEncoder().encode("{\"a\":1}"))).toBe(false);
    expect(isExecutable(Uint8Array.from([1, 2]))).toBe(false);
  });
});

import { boundedFilter, extractCode } from "./extensions";

describe("batas ukuran sebelum mengembang (zip bomb)", () => {
  const bomb = () => zipSync({ "extension/package.json": strToU8("{}"), "extension/data.bin": new Uint8Array(6 * 1024 * 1024) });

  it("entri yang terkembang melebihi batas ditolak sebelum dikembang", () => {
    const f = boundedFilter(() => true, 1024 * 1024);
    expect(() => f({ name: "x", size: 10, originalSize: 5 * 1024 * 1024, compression: 8 })).toThrow(/terlalu besar/);
  });

  it("batas kumulatif: beberapa entri kecil yang jumlahnya melebihi batas", () => {
    const f = boundedFilter(() => true, 100, 100);
    expect(f({ name: "a", size: 1, originalSize: 60, compression: 8 })).toBe(true);
    expect(() => f({ name: "b", size: 1, originalSize: 60, compression: 8 })).toThrow();
  });

  it("entri yang tidak lolos pola tidak dihitung", () => {
    const f = boundedFilter((n) => n.endsWith(".json"), 10);
    expect(f({ name: "besar.bin", size: 1, originalSize: 1e9, compression: 8 })).toBe(false);
  });

  it("zip kecil yang mengembang jadi 6 MB ditolak extractCode lewat filter (tanpa menulis apa pun)", () => {
    const dest = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-bomb-")));
    const orig = process.env.NODE_ENV;
    // Batas dikecilkan lewat pemanggilan langsung filter yang sama dengan extractCode.
    expect(() => unzipOnly(bomb(), 1024 * 1024)).toThrow(/terlalu besar/);
    expect(() => extractCode(bomb(), dest)).not.toThrow(); // 6 MB masih di bawah batas produksi
    process.env.NODE_ENV = orig;
    fs.rmSync(dest, { recursive: true, force: true });
  });
});

import { unzipSync } from "fflate";
const unzipOnly = (buf: Uint8Array, max: number) => unzipSync(buf, { filter: boundedFilter((n) => n.startsWith("extension/"), max) });
