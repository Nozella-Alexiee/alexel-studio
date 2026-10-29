import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getVersion: () => "0.0.1", isPackaged: true, getPath: () => os.tmpdir(), getAppPath: () => process.cwd() }, shell: {} }));

const { macSwapScript } = await import("./updater");

// Skrip ganti-bundel dijalankan sungguhan (ditto hanya ada di macOS).
describe.skipIf(process.platform !== "darwin")("ganti bundel .app saat pembaruan", () => {
  const setup = () => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "alexel-swap-")));
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    // `open` palsu: catat bahwa aplikasi dibuka lagi.
    fs.writeFileSync(path.join(bin, "open"), `#!/bin/sh\necho "$1" > "${dir}/opened"\n`, { mode: 0o755 });
    const mk = (name: string, marker: string) => {
      const app = path.join(dir, name);
      fs.mkdirSync(path.join(app, "Contents"), { recursive: true });
      fs.writeFileSync(path.join(app, "Contents", "marker"), marker);
      return app;
    };
    const script = path.join(dir, "swap.sh");
    fs.writeFileSync(script, macSwapScript());
    // Proses "aplikasi" yang sudah selesai.
    const run = (neu: string, old: string) => spawnSync("/bin/sh", [script, "999999", neu, old], { env: { ...process.env, PATH: `${bin}:/usr/bin:/bin:/usr/sbin` } });
    return { dir, mk, run, script };
  };

  it("mengganti bundel lama dengan yang baru, membersihkan cadangan, dan membuka kembali", () => {
    const { dir, mk, run, script } = setup();
    const old = mk("Alexel Studio.app", "lama");
    const neu = mk("new.app", "baru");
    run(neu, old);
    expect(fs.readFileSync(path.join(old, "Contents", "marker"), "utf8")).toBe("baru");
    expect(fs.readdirSync(dir).filter((n) => n.includes(".old-"))).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "opened"), "utf8").trim()).toBe(old);
    expect(fs.existsSync(script)).toBe(false);
  });

  it("bundel baru hilang: bundel lama dikembalikan utuh", () => {
    const { dir, mk, run } = setup();
    const old = mk("Alexel Studio.app", "lama");
    run(path.join(dir, "tidak-ada.app"), old);
    expect(fs.readFileSync(path.join(old, "Contents", "marker"), "utf8")).toBe("lama");
    expect(fs.readdirSync(dir).filter((n) => n.includes(".old-"))).toEqual([]);
  });
});

// Unduh + verifikasi sungguhan terhadap rilis GitHub palsu (fetch dimock).
describe("unduh & verifikasi pembaruan", () => {
  const plat = process.platform;
  const arch = process.arch;
  const asset = plat === "win32" ? `Alexel-Studio-win-${arch}.exe` : plat === "darwin" ? `Alexel-Studio-mac-${arch}.zip` : "Alexel-Studio-linux-x86_64.AppImage";
  const feed = plat === "win32" ? "latest.yml" : plat === "darwin" ? "latest-mac.yml" : "latest-linux.yml";
  const supported = (plat === "win32" || plat === "darwin" || (plat === "linux" && arch === "x64")) && !(plat === "win32" && arch !== "x64" && arch !== "arm64");

  const payload = async () => {
    if (plat !== "darwin") return new TextEncoder().encode("isi pemasang palsu");
    const { zipSync, strToU8 } = await import("fflate");
    return zipSync({ "Alexel Studio.app/Contents/Info.plist": strToU8("x") });
  };

  async function run(tamper: boolean) {
    const { createHash } = await import("node:crypto");
    const data = await payload();
    const sha = createHash("sha512").update(data).digest("base64");
    const repo = "Nozella-Alexiee/alexel-studio";
    const base = `https://github.com/${repo}/releases/download/v9.9.9`;
    const feedText = `version: 9.9.9\nfiles:\n  - url: ${asset}\n    sha512: ${sha}\n    size: ${data.length}\npath: ${asset}\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) return new Response(JSON.stringify({ tag_name: "v9.9.9", html_url: "x", assets: [{ name: feed, browser_download_url: `${base}/${feed}` }, { name: asset, browser_download_url: `${base}/${asset}` }] }));
        if (url.endsWith(feed)) return new Response(feedText);
        const body = tamper ? Uint8Array.from(data, (b, i) => (i === data.length - 1 ? b ^ 0xff : b)) : data;
        return new Response(new Blob([body as Uint8Array<ArrayBuffer>]));
      })
    );
    const events: unknown[] = [];
    const { updatePrepare } = await import("./updater");
    return { events, result: updatePrepare({ userData: "", emit: (e: string, p: unknown) => events.push([e, p]), trash: async () => {}, reveal: () => {} } as never) };
  }

  it.skipIf(!supported)("pemasang yang checksum-nya cocok diterima, progres 100%", async () => {
    if (plat === "linux") process.env.APPIMAGE = "/tmp/x.AppImage";
    const { events, result } = await run(false);
    await expect(result).resolves.toMatchObject({ version: "9.9.9" });
    expect(events.at(-1)).toEqual(["update-progress", { pct: 100 }]);
  });

  it.skipIf(!supported)("klik ganda memakai unduhan yang sama (folder tidak dihapus di tengah jalan)", async () => {
    if (plat === "linux") process.env.APPIMAGE = "/tmp/x.AppImage";
    const { result } = await run(false);
    const { updatePrepare } = await import("./updater");
    const again = updatePrepare({ userData: "", emit: () => {}, trash: async () => {}, reveal: () => {} } as never);
    expect(again).toBe(result);
    await expect(Promise.all([result, again])).resolves.toMatchObject([{ version: "9.9.9" }, { version: "9.9.9" }]);
  });

  it.skipIf(!supported)("berkas yang berubah satu byte ditolak dan tidak tersisa di disk", async () => {
    if (plat === "linux") process.env.APPIMAGE = "/tmp/x.AppImage";
    const { result } = await run(true);
    await expect(result).rejects.toThrow(/checksum|rusak/i);
    expect(fs.existsSync(path.join(os.tmpdir(), "alexel-update-9.9.9"))).toBe(false);
  });
});

describe("pembaruan: respons feed/berkas yang buruk ditolak", () => {
  const plat = process.platform;
  const supported = plat === "win32" || plat === "darwin" || (plat === "linux" && process.arch === "x64");
  const asset = plat === "win32" ? `Alexel-Studio-win-${process.arch}.exe` : plat === "darwin" ? `Alexel-Studio-mac-${process.arch}.zip` : "Alexel-Studio-linux-x86_64.AppImage";
  const feedName = plat === "win32" ? "latest.yml" : plat === "darwin" ? "latest-mac.yml" : "latest-linux.yml";
  const base = "https://github.com/Nozella-Alexiee/alexel-studio/releases/download/v9.9.9";
  const stub = (feed: Response | string, body?: Uint8Array) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.github.com")) return new Response(JSON.stringify({ tag_name: "v9.9.9", html_url: "x", assets: [{ name: feedName, browser_download_url: `${base}/${feedName}` }, { name: asset, browser_download_url: `${base}/${asset}` }] }));
        if (url.endsWith(feedName)) return typeof feed === "string" ? new Response(feed) : feed;
        return new Response(new Blob([(body ?? new Uint8Array(1)) as Uint8Array<ArrayBuffer>]));
      })
    );
  const ctx = { userData: "", emit: () => {}, trash: async () => {}, reveal: () => {} } as never;
  const feedFor = (version: string, size: number) => `version: ${version}\nfiles:\n  - url: ${asset}\n    sha512: AAAA\n    size: ${size}\npath: ${asset}\n`;

  it.skipIf(!supported)("feed 404 = galat jelas, bukan 'sudah versi terbaru'", async () => {
    if (plat === "linux") process.env.APPIMAGE = "/tmp/x.AppImage";
    stub(new Response("not found", { status: 404 }));
    const { updatePrepare } = await import("./updater");
    await expect(updatePrepare(ctx)).rejects.toThrow(/Feed pembaruan/);
  });

  it.skipIf(!supported)("versi feed berbahaya (path traversal) ditolak sebelum menyentuh disk", async () => {
    if (plat === "linux") process.env.APPIMAGE = "/tmp/x.AppImage";
    stub(feedFor("9.9.9/../../x", 1));
    const { updatePrepare } = await import("./updater");
    await expect(updatePrepare(ctx)).rejects.toThrow(/tidak valid/);
  });

  it.skipIf(!supported)("berkas lebih besar dari ukuran di feed dihentikan di tengah jalan", async () => {
    if (plat === "linux") process.env.APPIMAGE = "/tmp/x.AppImage";
    stub(feedFor("9.9.9", 4), new Uint8Array(64));
    const { updatePrepare } = await import("./updater");
    await expect(updatePrepare(ctx)).rejects.toThrow(/lebih besar/);
    expect(fs.existsSync(path.join(os.tmpdir(), "alexel-update-9.9.9"))).toBe(false);
  });
});
