// Berkas berubah di disk sementara ada editan yang belum disimpan.

import * as docs from "../editor/documents";
import { basename } from "../lib/paths";
import { ask, setState } from "../state/store";
import { tl } from "../i18n";

export async function resolveConflict(path: string): Promise<boolean> {
  const name = basename(path);
  const choice = await ask({
    kind: "choice",
    title: tl("{name} berubah di luar Alexel Studio", { name }),
    message: tl("Berkas ini diubah program lain (git, formatter, atau agen AI) sejak kamu membukanya, dan kamu juga punya editan yang belum disimpan."),
    choices: [
      { id: "overwrite", label: tl("Simpan versiku (timpa disk)"), danger: true },
      { id: "reload", label: tl("Pakai versi disk (buang editanku)") },
      { id: "compare", label: tl("Bandingkan dulu") },
    ],
  });
  if (choice === "overwrite") {
    setState((s) => (s.tabs[path] ? { tabs: { ...s.tabs, [path]: { ...s.tabs[path], conflict: false } } } : {}));
    return docs.saveDocument(path, { force: true });
  }
  if (choice === "reload") {
    await docs.reloadFromDisk(path);
    return false;
  }
  if (choice === "compare") {
    const { openDiskCompare } = await import("../panels/compare");
    openDiskCompare(path);
  }
  return false;
}
