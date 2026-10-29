// Pembaruan dalam aplikasi, tanpa layanan pihak ketiga: berkas diunduh dari rilis GitHub repositori
// ini, dicocokkan dengan SHA-512 di feed `latest*.yml` (satu rilis yang sama), lalu dipasang saat
// aplikasi keluar. Windows: pemasang NSIS senyap; macOS: ganti .app dari zip; Linux: ganti AppImage.
// Tidak ada tanda tangan kode di build ini, jadi keutuhan = checksum dari rilis resmi repositori.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, shell } from "electron";
import { feedName, parseFeed, pickInstaller, safeName, type UpdateKind } from "./updateFeed";
import { newerThan, repoSlug } from "./update";
import type { Ctx } from "./util";

/**
 * Skrip yang menunggu aplikasi keluar lalu mengganti bundel .app: `sh skrip <pid> <baru.app> <lama.app>`.
 * Bila penggantian gagal di tengah jalan, bundel lama dikembalikan; aplikasi dibuka lagi apa pun hasilnya.
 */
export const macSwapScript = () =>
  [
    "#!/bin/sh",
    'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done',
    'NEW="$2"; OLD="$3"; BAK="$OLD.old-$$"',
    'if mv "$OLD" "$BAK"; then',
    '  if ditto "$NEW" "$OLD"; then rm -rf "$BAK"; else rm -rf "$OLD"; mv "$BAK" "$OLD"; fi',
    "fi",
    // Berkas yang diunduh aplikasi sendiri tak punya karantina, tapi bersihkan bila ada.
    'xattr -dr com.apple.quarantine "$OLD" 2>/dev/null',
    'open "$OLD"',
    'rm -f "$0"',
  ].join("\n");

export interface UpdateOffer {
  /** Versi baru, atau null bila sudah terbaru. */
  version: string | null;
  kind: UpdateKind | null;
  /** Alasan tidak bisa otomatis (deb/rpm, dev build…); pemakai diarahkan ke halaman rilis. */
  manualReason: string | null;
  url: string | null;
}

interface Prepared {
  version: string;
  kind: UpdateKind;
  file: string;
}
let prepared: Prepared | null = null;
let scheduled: Prepared | null = null;

const UA = { "User-Agent": "Alexel-Studio", Accept: "application/vnd.github+json" };

async function latestRelease(repo: string): Promise<{ tag: string; url: string; assets: { name: string; url: string }[] }> {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`GitHub menjawab ${r.status}.`);
  const j = (await r.json()) as { tag_name: string; html_url: string; assets: { name: string; browser_download_url: string }[] };
  return { tag: j.tag_name, url: j.html_url, assets: (j.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })) };
}

/** Unduh feed latest*.yml: wajib HTTP 200 (halaman galat 404/HTML jangan dianggap feed kosong). */
async function fetchFeed(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Feed pembaruan tidak bisa diunduh (${r.status}).`);
  const feed = parseFeed(await r.text());
  // Versi dipakai sebagai bagian nama folder sementara: hanya bentuk semver yang diterima.
  if (!/^\d+\.\d+\.\d+([-+.\w]*)$/.test(feed.version)) throw new Error("Feed pembaruan tidak valid.");
  return feed;
}

const isAppImage = () => process.platform === "linux" && !!process.env.APPIMAGE;

/** Bundel .app yang sedang berjalan (macOS), atau null di build pengembangan. */
function macBundle(): string | null {
  const m = /^(.*?\.app)(?:\/|$)/.exec(process.execPath);
  return m ? m[1] : null;
}

export async function updateCheck(): Promise<UpdateOffer> {
  const repo = repoSlug();
  if (!repo) return { version: null, kind: null, manualReason: "no-repo", url: null };
  const rel = await latestRelease(repo);
  if (!newerThan(rel.tag, app.getVersion())) return { version: null, kind: null, manualReason: null, url: rel.url };
  const version = rel.tag.replace(/^v/, "");
  if (!app.isPackaged) return { version, kind: null, manualReason: "dev", url: rel.url };
  const feedAsset = rel.assets.find((a) => a.name === feedName(process.platform));
  if (!feedAsset) return { version, kind: null, manualReason: "no-feed", url: rel.url };
  const feed = await fetchFeed(feedAsset.url);
  const pick = pickInstaller(feed, { platform: process.platform, arch: process.arch, appImage: isAppImage() });
  if (!pick) return { version, kind: null, manualReason: process.platform === "linux" ? "linux-package" : "no-asset", url: rel.url };
  if (process.platform === "darwin" && !macBundle()) return { version, kind: null, manualReason: "dev", url: rel.url };
  return { version, kind: pick.kind, manualReason: null, url: rel.url };
}

let preparing: Promise<{ version: string; kind: UpdateKind }> | null = null;

/**
 * Unduh & verifikasi pemasang (tanpa memasang). Progres lewat event `update-progress`.
 * Klik ganda memakai unduhan yang sedang berjalan: unduhan kedua akan menghapus folder yang sedang ditulis.
 */
export function updatePrepare(ctx: Ctx): Promise<{ version: string; kind: UpdateKind }> {
  preparing ??= doPrepare(ctx).finally(() => (preparing = null));
  return preparing;
}

async function doPrepare(ctx: Ctx): Promise<{ version: string; kind: UpdateKind }> {
  const repo = repoSlug();
  if (!repo) throw new Error("Repositori tidak diketahui.");
  const rel = await latestRelease(repo);
  const feedAsset = rel.assets.find((a) => a.name === feedName(process.platform));
  if (!feedAsset) throw new Error("Feed pembaruan tidak ada di rilis.");
  const feed = await fetchFeed(feedAsset.url);
  if (!newerThan(feed.version, app.getVersion())) throw new Error("Sudah versi terbaru.");
  const pick = pickInstaller(feed, { platform: process.platform, arch: process.arch, appImage: isAppImage() });
  const name = pick && safeName(pick.file.url);
  if (!pick || !name) throw new Error("Tidak ada pemasang otomatis untuk sistem ini.");
  const asset = rel.assets.find((a) => a.name === name);
  if (!asset?.url.startsWith(`https://github.com/${repo}/releases/download/`)) throw new Error("Berkas pembaruan tidak ada di rilis.");

  const dir = path.join(app.getPath("temp"), `alexel-update-${feed.version}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  // Unduhan macet tidak boleh mengunci pembaruan selamanya: batas total 30 menit.
  const res = await fetch(asset.url, { headers: { "User-Agent": "Alexel-Studio" }, signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Gagal mengunduh pembaruan (${res.status}).`);
  const total = pick.file.size;
  const hash = createHash("sha512");
  const out = fs.createWriteStream(dest);
  // Galat tulis setelah dibatalkan (folder sudah dihapus) tidak boleh menjadi unhandled error.
  let writeErr: Error | null = null;
  out.on("error", (e) => (writeErr = e));
  let got = 0;
  let last = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      got += chunk.length;
      // Server tidak boleh mengirim lebih dari ukuran di feed (cegah disk penuh sebelum checksum dicek).
      if (got > total) throw new Error("Berkas pembaruan lebih besar dari yang diumumkan; dibatalkan.");
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
      const pct = Math.min(99, Math.floor((got / total) * 100));
      if (pct !== last) {
        last = pct;
        ctx.emit("update-progress", { pct });
      }
    }
    await new Promise<void>((r, j) => out.end((e: unknown) => (e ? j(e) : r())));
    if (writeErr) throw writeErr;
  } catch (e) {
    out.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  if (got !== total || hash.digest("base64") !== pick.file.sha512) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error("Berkas pembaruan rusak (checksum tidak cocok); dibatalkan.");
  }
  if (pick.kind === "mac-zip") {
    // ditto = pengekstrak zip bawaan macOS yang menjaga atribut & symlink bundel .app.
    // Asinkron: pembukaan zip ±130 MB tidak membekukan jendela.
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn("/usr/bin/ditto", ["-x", "-k", dest, path.join(dir, "app")], { stdio: "ignore" });
      p.on("error", () => resolve(-1));
      p.on("close", resolve);
    });
    if (code !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error("Gagal mengekstrak pembaruan.");
    }
  }
  prepared = { version: feed.version, kind: pick.kind, file: dest };
  ctx.emit("update-progress", { pct: 100 });
  return { version: feed.version, kind: pick.kind };
}

/** Jadwalkan pemasangan saat aplikasi keluar. Renderer menutup jendela lewat alur biasa (tanya simpan dulu). */
export function updateApply(): void {
  if (!prepared) throw new Error("Belum ada pembaruan yang diunduh.");
  if (prepared.kind === "mac-zip") {
    const bundle = macBundle();
    if (!bundle) throw new Error("Aplikasi tidak berjalan dari bundel .app.");
    try {
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    } catch {
      throw new Error("Tidak bisa menulis ke folder aplikasi; unduh DMG dari halaman rilis.");
    }
  }
  if (prepared.kind === "appimage" && !process.env.APPIMAGE) throw new Error("AppImage tidak dikenali.");
  scheduled = prepared;
}

/** Dipanggil dari `app.on("quit")`: jalankan pemasang terjadwal setelah proses ini berakhir. */
export function runScheduledUpdate() {
  const u = scheduled;
  scheduled = null;
  if (!u) return;
  try {
    if (u.kind === "nsis") {
      // Opsi yang sama dengan electron-updater: senyap, tandai sebagai pembaruan, jalankan lagi setelahnya.
      const p = spawn(u.file, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore" });
      // Kegagalan asinkron (EACCES/ENOENT) jangan jadi uncaught exception di handler quit.
      p.on("error", (e) => {
        console.error("Pemasang pembaruan gagal dijalankan:", e);
        void shell.openPath(path.dirname(u.file));
      });
      p.unref();
    } else if (u.kind === "appimage") {
      const cur = process.env.APPIMAGE!;
      fs.copyFileSync(u.file, `${cur}.new`);
      fs.chmodSync(`${cur}.new`, 0o755);
      fs.renameSync(`${cur}.new`, cur);
      spawn(cur, [], { detached: true, stdio: "ignore" }).unref();
    } else {
      const bundle = macBundle()!;
      const fresh = fs.readdirSync(path.join(path.dirname(u.file), "app")).find((n) => n.endsWith(".app"));
      if (!fresh) throw new Error("Bundel .app tidak ditemukan di pembaruan.");
      const script = path.join(os.tmpdir(), `alexel-update-${process.pid}.sh`);
      fs.writeFileSync(script, macSwapScript());
      spawn("/bin/sh", [script, String(process.pid), path.join(path.dirname(u.file), "app", fresh), bundle], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (e) {
    console.error("Pembaruan gagal dipasang:", e);
    void shell.openPath(path.dirname(u.file));
  }
}
