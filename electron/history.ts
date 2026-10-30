// Time-travel per berkas: tiap simpan menyimpan salinan di <userData>/history/<hash>/<waktu>.snap.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./util";

const MAX_SNAPSHOTS_PER_FILE = 80;
const MAX_BYTES_PER_FILE = 24 * 1024 * 1024;
const MAX_SNAPSHOT_SIZE = 2 * 1024 * 1024;

export interface Snapshot {
  id: string;
  time_ms: number;
  size: number;
  lines: number;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
export const historyDir = (ctx: Ctx, file: string) => path.join(ctx.userData, "history", hash(file));

function listSorted(dir: string): { t: number; p: string; size: number }[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { t: number; p: string; size: number }[] = [];
  for (const n of names) {
    if (!n.endsWith(".snap")) continue;
    const t = Number(n.slice(0, -5));
    if (!Number.isFinite(t)) continue;
    const p = path.join(dir, n);
    try {
      out.push({ t, p, size: fs.statSync(p).size });
    } catch {
      /* snapshot dihapus bersamaan (pemangkasan dari jendela lain): lewati */
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function snapshotIn(dir: string, file: string, content: string) {
  if (Buffer.byteLength(content) > MAX_SNAPSHOT_SIZE) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "path.txt"), file);
    const existing = listSorted(dir);
    const last = existing[existing.length - 1];
    if (last && fs.readFileSync(last.p, "utf8") === content) return;
    let t = Date.now();
    if (last && last.t >= t) t = last.t + 1;
    fs.writeFileSync(path.join(dir, `${t}.snap`), content);
    const all = listSorted(dir);
    let total = all.reduce((a, x) => a + x.size, 0);
    while (all.length > MAX_SNAPSHOTS_PER_FILE || (total > MAX_BYTES_PER_FILE && all.length > 1)) {
      const x = all.shift()!;
      fs.rmSync(x.p, { force: true });
      total -= x.size;
    }
  } catch {
    /* gagal mencatat riwayat tidak boleh menggagalkan simpan */
  }
}

export const snapshot = (ctx: Ctx, file: string, content: string) => snapshotIn(historyDir(ctx, file), file, content);

export function historyList(ctx: Ctx, file: string): Snapshot[] {
  const out: Snapshot[] = [];
  for (const x of listSorted(historyDir(ctx, file))) {
    try {
      out.push({ id: String(x.t), time_ms: x.t, size: x.size, lines: fs.readFileSync(x.p, "utf8").split("\n").length });
    } catch {
      /* hilang di antara stat dan baca: lewati */
    }
  }
  return out.reverse();
}

export function historyRead(ctx: Ctx, file: string, id: string): string {
  if (!/^\d+$/.test(id)) throw new Error("ID snapshot tidak valid.");
  try {
    return fs.readFileSync(path.join(historyDir(ctx, file), `${id}.snap`), "utf8");
  } catch {
    throw new Error("Snapshot tidak ditemukan.");
  }
}

export const _test = { listSorted, MAX_SNAPSHOTS_PER_FILE };
