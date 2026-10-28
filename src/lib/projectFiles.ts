// Daftar berkas project (relatif) yang di-cache, dipakai Quick Open dan @-mention di panel Claude.

import { api, on } from "./ipc";

let cache: { root: string; files: string[] } | null = null;
let stale = true;
void on("fs-changed", () => (stale = true));

const extraCache = new Map<string, string[]>();

/**
 * Berkas folder workspace tambahan (multi-root) sebagai path relatif berawalan nama folder, mis.
 * "api/src/a.ts" → dipetakan balik ke path absolut lewat `abs`.
 */
export async function workspaceExtraFiles(extra: string[]): Promise<{ label: string; abs: string }[]> {
  const out: { label: string; abs: string }[] = [];
  for (const r of extra) {
    let files = !stale ? extraCache.get(r) : undefined;
    if (!files) {
      files = await api.listFiles(r).catch(() => []);
      extraCache.set(r, files);
    }
    const name = r.replace(/\/+$/, "").split("/").pop() ?? r;
    for (const f of files) out.push({ label: `${name}/${f}`, abs: `${r.replace(/\/+$/, "")}/${f}` });
  }
  return out;
}

export async function projectFiles(root: string): Promise<string[]> {
  if (cache?.root === root && !stale) return cache.files;
  const files = await api.listFiles(root).catch(() => []);
  cache = { root, files };
  stale = false;
  return files;
}
