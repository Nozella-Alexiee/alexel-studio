// Penyimpanan JSON kecil (pengaturan, sesi, project terakhir) di folder userData,
// plus migrasi sekali jalan dari nama lama (Nozel Code) dan versi Tauri.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAtomic } from "./fsOps";
import type { Ctx } from "./util";

export const validKey = (k: string) => /^[a-z0-9_-]{1,64}$/.test(k);

export function storeLoad(ctx: Ctx, key: string): string | null {
  if (!validKey(key)) throw new Error("Kunci tidak valid.");
  try {
    return fs.readFileSync(path.join(ctx.userData, `${key}.json`), "utf8");
  } catch {
    return null;
  }
}

export async function storeSave(ctx: Ctx, key: string, json: string) {
  if (!validKey(key)) throw new Error("Kunci tidak valid.");
  JSON.parse(json);
  await writeAtomic(path.join(ctx.userData, `${key}.json`), json);
}

const CARRY_FILES = ["settings.json", "session.json", "recents.json"];
const CARRY_DIRS = ["history", "extensions"];

/** Salin data pengguna dari folder lama ke userData sekarang, sekali saja (ditandai `marker`). */
function carryOver(ctx: Ctx, old: string, marker: string) {
  const mark = path.join(ctx.userData, marker);
  if (path.resolve(old) === path.resolve(ctx.userData) || !fs.existsSync(old) || fs.existsSync(mark)) return;
  try {
    fs.mkdirSync(ctx.userData, { recursive: true });
    for (const f of CARRY_FILES) {
      const src = path.join(old, f);
      const dst = path.join(ctx.userData, f);
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
    for (const d of CARRY_DIRS) {
      const src = path.join(old, d);
      const dst = path.join(ctx.userData, d);
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.cpSync(src, dst, { recursive: true });
    }
    fs.writeFileSync(mark, new Date().toISOString());
  } catch {
    /* migrasi opsional */
  }
}

/**
 * Bawa pengaturan, sesi, riwayat, dan ekstensi dari nama lama aplikasi ("Nozel Code"),
 * lalu dari versi Tauri lama bila masih ada.
 */
export function migrateOldData(ctx: Ctx, appData: string) {
  // Versi Nozel memakai folder "Nozel Code" (nama produk) atau "nozel-code" (nama paket).
  for (const old of ["Nozel Code", "nozel-code"]) carryOver(ctx, path.join(appData, old), `.migrated-from-${old.replace(/\W+/g, "-").toLowerCase()}`);
  if (process.platform === "darwin") carryOver(ctx, path.join(os.homedir(), "Library/Application Support/com.nozel.code"), ".migrated-from-tauri");
}
