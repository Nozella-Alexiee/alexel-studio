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

  it("tema + kode = sebagian, dengan fitur yang butuh kode", () => {
    const c = classifyManifest({ main: "./out/ext.js", contributes: { iconThemes: [{}], commands: [{ command: "x" }] } });
    expect(c.level).toBe("partial");
    expect(c.needs).toEqual(["commands"]);
  });

  it("tanpa kontribusi data = tidak didukung, dengan pengganti bawaan bila ada", () => {
    const c = classifyManifest({ main: "./x.js", contributes: { commands: [{}] } }, "esbenp.prettier-vscode");
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
    stubOpenVsx(vsixOf({ name: "ext", version: "2.0.0", main: "x.js", contributes: { commands: [{}] } }), "2.0.0");
    await expect(extInstall(ctx, "pub", "ext")).rejects.toThrow(/tidak berisi/);
    expect(fs.readdirSync(path.join(userData, "extensions"))).toEqual(["pub.ext"]);
    expect(extList(ctx)[0].version).toBe("1.0.0");
  });

  it("sisa pemasangan terputus dibersihkan", () => {
    const userData = tmp();
    fs.mkdirSync(path.join(userData, "extensions", ".tmp-pub.ext-1-2"), { recursive: true });
    expect(extList(ctxFor(userData))).toEqual([]);
    expect(fs.readdirSync(path.join(userData, "extensions"))).toEqual([]);
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
