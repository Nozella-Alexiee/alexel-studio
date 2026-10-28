// Tampilan sidebar dari ekstensi: pohon dan webview. Daftar yang tampil = yang didaftarkan host dan `when`-nya benar.

import { evalWhen, whenContext } from "./commands";
import { useExtensions } from "../extensions/registry";
import { useExtHost } from "./state";
import { useStore } from "../state/store";

export interface ExtViewEntry {
  id: string;
  name: string;
  kind: "tree" | "webview";
  owner?: string;
}

export function useExtViews(): ExtViewEntry[] {
  const trees = useExtHost((s) => s.treeViews);
  const webs = useExtHost((s) => s.webviewViews);
  const contexts = useExtHost((s) => s.contexts);
  const list = useExtensions((s) => s.list);
  const running = useExtHost((s) => s.running);
  const trusted = useStore((s) => s.settings.trustedExts);
  const disabled = useStore((s) => s.settings.disabledExts);
  const decl = new Map<string, { name: string; when?: string; type?: string; ext: string }>();
  for (const e of list) for (const group of Object.values((e.contributes?.views ?? {}) as Record<string, { id: string; name?: string; when?: string; type?: string }[]>)) for (const v of group) decl.set(v.id, { name: v.name ?? "", when: v.when, type: v.type, ext: e.id });
  const ctx = { ...whenContext(), ...contexts };
  const out: ExtViewEntry[] = [];
  for (const id of Object.keys(trees)) out.push({ id, name: decl.get(id)?.name || id, kind: "tree", owner: trees[id].owner });
  for (const id of Object.keys(webs)) {
    const d = decl.get(id);
    if (d?.when && !evalWhen(d.when, ctx)) continue;
    out.push({ id, name: d?.name || id, kind: "webview", owner: webs[id].owner });
  }
  // Tampilan yang dideklarasikan ekstensi tepercaya tetapi belum didaftarkan (menunggu `onView:`): tampilkan agar dibuka → host mengaktifkannya.
  if (running) {
    for (const [id, d] of decl) {
      if (trees[id] || webs[id] || !trusted.includes(d.ext) || disabled.includes(d.ext)) continue;
      if (d.when && !evalWhen(d.when, ctx)) continue;
      out.push({ id, name: d.name || id, kind: d.type === "webview" ? "webview" : "tree", owner: d.ext });
    }
  }
  return out;
}

export const useHasExtViews = () => useExtViews().length > 0;
