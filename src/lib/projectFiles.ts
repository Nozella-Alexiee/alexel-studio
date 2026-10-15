// Daftar berkas project (relatif) yang di-cache, dipakai Quick Open dan @-mention di panel Claude.

import { api, on } from "./ipc";

let cache: { root: string; files: string[] } | null = null;
let stale = true;
void on("fs-changed", () => (stale = true));

export async function projectFiles(root: string): Promise<string[]> {
  if (cache?.root === root && !stale) return cache.files;
  const files = await api.listFiles(root).catch(() => []);
  cache = { root, files };
  stale = false;
  return files;
}
