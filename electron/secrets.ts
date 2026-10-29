// Rahasia (password database, token API) dienkripsi dengan safeStorage (Keychain macOS, DPAPI
// Windows, libsecret Linux) dan disimpan di userData/secrets.json. Tanpa enkripsi OS, rahasia hanya
// disimpan di memori selama aplikasi berjalan. Rahasia tidak pernah dikirim ke renderer.

import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./util";

type SafeStorage = { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string };

let storage: SafeStorage | null = null;
/** Diisi main process (electron.safeStorage); uji memakai penyimpanan memori. */
export function setSafeStorage(s: SafeStorage | null) {
  storage = s;
}

const memory = new Map<string, string>();
const validKey = (k: string) => /^[\w.:-]{1,200}$/.test(k);
const file = (ctx: Ctx) => path.join(ctx.userData, "secrets.json");

function readAll(ctx: Ctx): Record<string, string> {
  try {
    const j = JSON.parse(fs.readFileSync(file(ctx), "utf8"));
    return j && typeof j === "object" ? (j as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeAll(ctx: Ctx, all: Record<string, string>) {
  const tmp = file(ctx) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
  fs.renameSync(tmp, file(ctx));
}

const encrypted = () => !!storage?.isEncryptionAvailable();

export function setSecret(ctx: Ctx, key: string, value: string | null) {
  if (!validKey(key)) throw new Error("Kunci rahasia tidak valid.");
  if (!encrypted()) {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    return;
  }
  const all = readAll(ctx);
  if (value === null) delete all[key];
  else all[key] = storage!.encryptString(value).toString("base64");
  writeAll(ctx, all);
}

export function getSecret(ctx: Ctx, key: string): string | null {
  if (!validKey(key)) return null;
  if (memory.has(key)) return memory.get(key)!;
  if (!encrypted()) return null;
  const v = readAll(ctx)[key];
  if (!v) return null;
  try {
    return storage!.decryptString(Buffer.from(v, "base64"));
  } catch {
    return null;
  }
}

export const hasSecret = (ctx: Ctx, key: string) => getSecret(ctx, key) !== null;
/** Rahasia disimpan permanen (terenkripsi OS) atau hanya selama sesi. */
export const secretsPersistent = () => encrypted();
