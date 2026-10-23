// Tampilan sidebar dari ekstensi: pohon dan webview. Daftar yang tampil = yang didaftarkan host dan `when`-nya benar.

import { evalWhen, whenContext } from "./commands";
import { useExtensions } from "../extensions/registry";
import { useExtHost } from "./state";

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
  const decl = new Map<string, { name: string; when?: string; type?: string }>();
  for (const e of list) for (const group of Object.values((e.contributes?.views ?? {}) as Record<string, { id: string; name?: string; when?: string; type?: string }[]>)) for (const v of group) decl.set(v.id, { name: v.name ?? "", when: v.when, type: v.type });
  const ctx = { ...whenContext(), ...contexts };
  const out: ExtViewEntry[] = [];
  for (const id of Object.keys(trees)) out.push({ id, name: decl.get(id)?.name || id, kind: "tree", owner: trees[id].owner });
  for (const id of Object.keys(webs)) {
    const d = decl.get(id);
    if (d?.when && !evalWhen(d.when, ctx)) continue;
    out.push({ id, name: d?.name || id, kind: "webview", owner: webs[id].owner });
  }
  return out;
}

export const useHasExtViews = () => useExtViews().length > 0;
