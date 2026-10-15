// Operasi berkas: baca, tulis atomik, buat, hapus ke Trash, rename, duplikat.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { snapshot } from "./history";
import { ensureCleanPath, type Ctx } from "./util";

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size?: number | null;
  extension?: string | null;
}

export const mtimeMs = async (p: string) => {
  try {
    return Math.floor((await fsp.stat(p)).mtimeMs);
  } catch {
    return 0;
  }
};

export async function listDir(dir: string): Promise<FileEntry[]> {
  let dirents: fs.Dirent[];
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Folder tidak ditemukan: ${dir}`);
  }
  const out: FileEntry[] = [];
  for (const d of dirents) {
    if (d.name === ".DS_Store" || d.name === ".git") continue;
    const p = path.join(dir, d.name);
    const isSymlink = d.isSymbolicLink();
    let isDir = d.isDirectory();
    let size: number | null = null;
    if (isSymlink || !isDir) {
      try {
        const st = await fsp.stat(p);
        isDir = st.isDirectory();
        if (!isDir) size = st.size;
      } catch {
        /* symlink rusak: tampil sebagai berkas */
      }
    }
    const ext = isDir ? null : path.extname(d.name).slice(1).toLowerCase() || null;
    out.push({ name: d.name, path: p, is_dir: isDir, is_symlink: isSymlink, size, extension: ext });
  }
  out.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return out;
}

export async function readText(p: string): Promise<{ content: string; mtime_ms: number; eol: "lf" | "crlf" }> {
  let st;
  try {
    st = await fsp.stat(p);
  } catch {
    throw new Error(`Berkas tidak ditemukan: ${p}`);
  }
  if (st.isDirectory()) throw new Error("Itu folder, bukan berkas.");
  if (!st.isFile()) throw new Error("Ini bukan berkas biasa (pipe/device), tidak dibuka.");
  if (st.size > MAX_TEXT_BYTES) throw new Error(`Berkas terlalu besar (${(st.size / 1048576).toFixed(1)} MB). Batas editor 8 MB.`);
  const buf = await fsp.readFile(p);
  if (buf.subarray(0, 8192).includes(0)) throw new Error("BINARY: Berkas biner tidak bisa dibuka sebagai teks.");
  let content: string;
  try {
    // fatal: berkas non-UTF-8 ditolak supaya isinya tidak rusak saat disimpan.
    content = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new Error("ENCODING: Berkas bukan UTF-8. Nozel tidak membukanya supaya isinya tidak rusak saat disimpan.");
  }
  return { content, mtime_ms: Math.floor(st.mtimeMs), eol: content.includes("\r\n") ? "crlf" : "lf" };
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
};

export async function readImage(p: string) {
  const st = await fsp.stat(p).catch(() => null);
  if (!st || !st.isFile()) throw new Error("Gambar tidak ditemukan.");
  if (st.size > MAX_IMAGE_BYTES) throw new Error("Gambar lebih dari 25 MB.");
  const ext = path.extname(p).slice(1).toLowerCase();
  const b64 = (await fsp.readFile(p)).toString("base64");
  return { data_url: `data:${MIME[ext] ?? "application/octet-stream"};base64,${b64}`, size_bytes: st.size, format: ext };
}

/** Tulis atomik: berkas sementara di folder yang sama lalu rename. Izin & target symlink dipertahankan. */
export async function writeAtomic(p: string, data: string | Buffer) {
  let target = p;
  try {
    target = await fsp.realpath(p);
  } catch {
    /* berkas baru */
  }
  const dir = path.dirname(target);
  await fsp.mkdir(dir, { recursive: true });
  const mode = await fsp
    .stat(target)
    .then((s) => s.mode)
    .catch(() => null);
  const tmp = path.join(dir, `.${path.basename(target)}.nozel-tmp-${process.pid}-${Date.now()}`);
  const fh = await fsp.open(tmp, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  if (mode !== null) await fsp.chmod(tmp, mode).catch(() => {});
  try {
    await fsp.rename(tmp, target);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw new Error(`Gagal menyimpan berkas: ${(e as Error).message}`);
  }
}

export async function writeText(ctx: Ctx, p: string, content: string): Promise<number> {
  await writeAtomic(p, content);
  snapshot(ctx, p, content);
  return mtimeMs(p);
}

export async function createFile(p: string) {
  ensureCleanPath(p);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  try {
    await (await fsp.open(p, "wx")).close();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Sudah ada berkas atau folder dengan nama itu.");
    throw e;
  }
}

export async function createDir(p: string) {
  ensureCleanPath(p);
  if (fs.existsSync(p)) throw new Error("Folder sudah ada.");
  await fsp.mkdir(p, { recursive: true });
}

export async function renameEntry(from: string, to: string) {
  ensureCleanPath(to);
  if (!fs.existsSync(from)) throw new Error("Berkas asal tidak ada.");
  const sameCi = from.toLowerCase() === to.toLowerCase();
  if (fs.existsSync(to) && !sameCi) throw new Error("Sudah ada berkas dengan nama tujuan.");
  await fsp.rename(from, to);
}

export async function duplicateEntry(p: string): Promise<string> {
  const st = await fsp.stat(p);
  const dir = path.dirname(p);
  const ext = st.isDirectory() ? "" : path.extname(p);
  const stem = st.isDirectory() ? path.basename(p) : path.basename(p, ext);
  for (let i = 1; i < 1000; i++) {
    const cand = path.join(dir, `${stem}${i === 1 ? " copy" : ` copy ${i}`}${ext}`);
    if (!fs.existsSync(cand)) {
      await fsp.cp(p, cand, { recursive: true });
      return cand;
    }
  }
  throw new Error("Terlalu banyak salinan.");
}

const UNDO_MAX_BYTES = 50 * 1024 * 1024;
const UNDO_TTL_MS = 60 * 60 * 1000;

async function sizeOf(p: string, limit: number): Promise<number> {
  const st = await fsp.lstat(p);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of await fsp.readdir(p)) {
    total += await sizeOf(path.join(p, e), limit - total);
    if (total > limit) break;
  }
  return total;
}

/** Hapus salinan "urungkan" yang sudah lebih dari sejam. */
export async function pruneUndo(ctx: Ctx) {
  const dir = path.join(ctx.userData, "undo-trash");
  for (const e of await fsp.readdir(dir).catch(() => [] as string[])) {
    const st = await fsp.stat(path.join(dir, e)).catch(() => null);
    if (st && Date.now() - st.mtimeMs > UNDO_TTL_MS) await fsp.rm(path.join(dir, e), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Pindahkan ke Trash/Recycle Bin. Bila kecil (≤ 50 MB), simpan salinan sementara dulu supaya
 * bisa diurungkan dari dalam Nozel (Trash sistem tidak bisa dipulihkan lewat API lintas OS).
 * Mengembalikan token urungkan, atau null bila terlalu besar.
 */
export async function deleteEntry(ctx: Ctx, p: string): Promise<string | null> {
  try {
    await fsp.lstat(p);
  } catch {
    throw new Error("Berkas sudah tidak ada.");
  }
  let token: string | null = null;
  try {
    if ((await sizeOf(p, UNDO_MAX_BYTES + 1)) <= UNDO_MAX_BYTES) {
      token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const dest = path.join(ctx.userData, "undo-trash", token, path.basename(p));
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.cp(p, dest, { recursive: true, verbatimSymlinks: true });
    }
  } catch {
    token = null;
  }
  try {
    await ctx.trash(p);
  } catch (e) {
    if (token) await fsp.rm(path.join(ctx.userData, "undo-trash", token), { recursive: true, force: true }).catch(() => {});
    throw new Error(`Gagal memindahkan ke Trash: ${(e as Error).message}`);
  }
  return token;
}

/** Kembalikan berkas/folder yang baru dihapus dari salinan sementara. */
export async function restoreDeleted(ctx: Ctx, token: string, original: string) {
  if (!/^[\w-]+$/.test(token)) throw new Error("Token tidak valid.");
  const dir = path.join(ctx.userData, "undo-trash", token);
  const src = path.join(dir, path.basename(original));
  if (!fs.existsSync(src)) throw new Error("Salinan sudah kedaluwarsa. Ambil dari Trash sistem.");
  if (fs.existsSync(original)) throw new Error("Sudah ada berkas dengan nama itu di tempat asalnya.");
  await fsp.mkdir(path.dirname(original), { recursive: true });
  await fsp.cp(src, original, { recursive: true, verbatimSymlinks: true });
  await fsp.rm(dir, { recursive: true, force: true });
}
