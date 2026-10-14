// Penyimpanan JSON kecil (pengaturan, sesi, project terakhir) di folder userData,
// plus migrasi sekali jalan dari versi Tauri (~/Library/Application Support/com.nozel.code).

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

/** Bawa pengaturan, sesi, dan riwayat dari Nozel versi Tauri bila ada. */
export function migrateFromTauri(ctx: Ctx) {
  if (process.platform !== "darwin") return;
  const old = path.join(os.homedir(), "Library/Application Support/com.nozel.code");
  const marker = path.join(ctx.userData, ".migrated-from-tauri");
  if (!fs.existsSync(old) || fs.existsSync(marker)) return;
  try {
    fs.mkdirSync(ctx.userData, { recursive: true });
    for (const f of ["settings.json", "session.json", "recents.json"]) {
      const src = path.join(old, f);
      const dst = path.join(ctx.userData, f);
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
    const hist = path.join(old, "history");
    if (fs.existsSync(hist) && !fs.existsSync(path.join(ctx.userData, "history"))) fs.cpSync(hist, path.join(ctx.userData, "history"), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  } catch {
    /* migrasi opsional */
  }
}
