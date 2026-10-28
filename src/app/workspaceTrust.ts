// Workspace Trust ringan (seperti VS Code Restricted Mode): folder yang belum dipercaya dan berisi
// sesuatu yang bisa menjalankan kode (.vscode/tasks.json, launch.json, .alexel/run.json, atau ada
// ekstensi berkode yang dipercaya) ditanya dulu. Dalam mode terbatas, extension host tidak
// dijalankan dan target Run dari berkas konfigurasi folder disembunyikan. Folder yang dipercaya
// juga mempercayai sub-foldernya.

import { call } from "../lib/ipc";
import { isInside, join } from "../lib/paths";
import { ask, getState, setState } from "../state/store";
import { tl } from "../i18n";
import * as A from "./actions";

export const isFolderTrusted = (dir: string, trusted = getState().settings.trustedFolders) => trusted.some((t) => t === dir || isInside(t, dir));

const RISKY = [".vscode/tasks.json", ".vscode/launch.json", ".alexel/run.json"];

async function hasRunnableConfig(dir: string): Promise<boolean> {
  for (const rel of RISKY) if (await call<boolean>("path_exists", { path: join(dir, rel) }).catch(() => false)) return true;
  return false;
}

/** Dipanggil saat folder dibuka: tentukan mode terbatas atau tanya pemakai. */
export async function checkFolderTrust(dirs: string[]): Promise<void> {
  const untrusted = dirs.filter((d) => !isFolderTrusted(d));
  if (!untrusted.length) return setState({ restricted: false });
  const s = getState();
  const codeExts = s.settings.trustedExts.length > 0;
  let risky = codeExts;
  for (const d of untrusted) if (!risky && (await hasRunnableConfig(d))) risky = true;
  // Tidak ada yang bisa dijalankan otomatis: tidak perlu bertanya.
  if (!risky) return setState({ restricted: false });
  const r = await ask({
    kind: "choice",
    title: tl("Percayai pembuat berkas di folder ini?"),
    message: tl("Folder ini berisi konfigurasi yang bisa menjalankan perintah (task/launch) atau akan dibuka oleh ekstensi berkode. Dalam mode terbatas, ekstensi berkode tidak dijalankan dan task dari folder ini disembunyikan."),
    detail: untrusted.join("\n"),
    choices: [
      { id: "trust", label: tl("Percayai") },
      { id: "restricted", label: tl("Mode terbatas") },
    ],
  });
  if (r === "trust") return trustFolders(untrusted);
  setState({ restricted: true });
}

export function trustFolders(dirs: string[]) {
  const cur = getState().settings.trustedFolders;
  A.updateSettings({ trustedFolders: [...cur, ...dirs.filter((d) => !cur.includes(d))] });
  setState({ restricted: false });
  void A.refreshRunTargets();
}

/** Dari status bar: percayai semua folder workspace yang terbuka. */
export function trustCurrentWorkspace() {
  trustFolders(A.workspaceRoots());
}
