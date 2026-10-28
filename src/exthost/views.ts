// Tampilan sidebar dari ekstensi: pohon dan webview. Daftar yang tampil = yang didaftarkan host dan `when`-nya
// benar (termasuk `when` wadahnya di viewsContainers). Tampilan dikelompokkan per wadah, seperti ikon/tab
// tersendiri di VS Code (mis. Claude Code dan Codex masing-masing satu tab di panel kanan).

import { evalWhen, whenContext } from "./commands";
import { useExtensions } from "../extensions/registry";
import { useExtHost } from "./state";
import { useStore } from "../state/store";

export interface ExtViewEntry {
  id: string;
  name: string;
  kind: "tree" | "webview";
  owner?: string;
  /** Wadah (viewsContainers) tempat tampilan ini berada. */
  container: string;
}

export interface ExtContainer {
  id: string;
  title: string;
  /** URL ikon (nozelext://icons/...) bila ada. */
  icon?: string;
  owner?: string;
  /** Lokasi asal di VS Code: activitybar (sidebar kiri) atau secondarySidebar/panel (kanan). */
  location: string;
  views: ExtViewEntry[];
}

interface Decl {
  name: string;
  when?: string;
  type?: string;
  ext: string;
  container: string;
}

type ContainerDecl = { id: string; title?: string; icon?: string; when?: string };

export function useExtContainers(): ExtContainer[] {
  const trees = useExtHost((s) => s.treeViews);
  const webs = useExtHost((s) => s.webviewViews);
  const contexts = useExtHost((s) => s.contexts);
  const list = useExtensions((s) => s.list);
  const running = useExtHost((s) => s.running);
  const trusted = useStore((s) => s.settings.trustedExts);
  const disabled = useStore((s) => s.settings.disabledExts);
  const ctx = { ...whenContext(), ...contexts };
  const ok = (when?: string) => !when || evalWhen(when, ctx);

  const decl = new Map<string, Decl>();
  const containers = new Map<string, { title: string; icon?: string; when?: string; ext: string; location: string }>();
  for (const e of list) {
    const c = e.contributes ?? {};
    for (const [location, group] of Object.entries((c.viewsContainers ?? {}) as Record<string, ContainerDecl[]>)) {
      for (const k of Array.isArray(group) ? group : []) {
        if (!k?.id) continue;
        const icon = typeof k.icon === "string" && /\.(svg|png)$/i.test(k.icon) ? `nozelext://icons/${encodeURIComponent(e.id)}/ext/${k.icon.replace(/^\.?\//, "")}` : undefined;
        containers.set(k.id, { title: k.title || e.displayName, icon, when: k.when, ext: e.id, location });
      }
    }
    for (const [cid, group] of Object.entries((c.views ?? {}) as Record<string, { id: string; name?: string; when?: string; type?: string }[]>)) {
      for (const v of Array.isArray(group) ? group : []) decl.set(v.id, { name: v.name ?? "", when: v.when, type: v.type, ext: e.id, container: cid });
    }
  }

  const out: ExtViewEntry[] = [];
  const visible = (id: string) => {
    const d = decl.get(id);
    if (!d) return true;
    if (!ok(d.when)) return false;
    const k = containers.get(d.container);
    return !k || ok(k.when);
  };
  const push = (id: string, kind: "tree" | "webview", owner?: string) => {
    const d = decl.get(id);
    const k = d ? containers.get(d.container) : undefined;
    out.push({ id, name: d?.name || k?.title || id, kind, owner: owner ?? d?.ext, container: d?.container ?? `ext:${owner ?? "?"}` });
  };
  for (const id of Object.keys(trees)) if (visible(id)) push(id, "tree", trees[id].owner);
  for (const id of Object.keys(webs)) if (visible(id)) push(id, "webview", webs[id].owner);
  // Tampilan yang dideklarasikan ekstensi tepercaya tetapi belum didaftarkan (menunggu `onView:`): tampilkan agar dibuka → host mengaktifkannya.
  if (running) {
    for (const [id, d] of decl) {
      if (trees[id] || webs[id] || !trusted.includes(d.ext) || disabled.includes(d.ext) || !visible(id)) continue;
      push(id, d.type === "webview" ? "webview" : "tree", d.ext);
    }
  }

  const byContainer = new Map<string, ExtContainer>();
  for (const v of out) {
    let c = byContainer.get(v.container);
    if (!c) {
      const k = containers.get(v.container);
      const owner = k?.ext ?? v.owner;
      const extName = list.find((e) => e.id === owner)?.displayName;
      // Tampilan bawaan VS Code (explorer, scm, test, debug) ditaruh di kanan juga: Alexel tidak punya wadah itu untuk ekstensi.
      c = { id: v.container, title: k?.title || extName || v.name, icon: k?.icon, owner, location: k?.location ?? "secondarySidebar", views: [] };
      byContainer.set(v.container, c);
    }
    c.views.push(v);
  }
  return [...byContainer.values()];
}

export function useExtViews(): ExtViewEntry[] {
  return useExtContainers().flatMap((c) => c.views);
}

export const useHasExtViews = () => useExtContainers().length > 0;
