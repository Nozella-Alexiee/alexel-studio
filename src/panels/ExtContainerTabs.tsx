// Tab per wadah tampilan ekstensi di panel kanan (seperti secondary sidebar VS Code: Claude Code, Codex, …).
// Terpisah dari ExtViews.tsx supaya shell tidak ikut memuat panel tampilan (lazy).

import { Layers } from "lucide-react";
import { useExtContainers, type ExtContainer } from "../exthost/views";
import { setLayout, useStore } from "../state/store";

/** Wadah yang sedang dipilih (bawaan: yang pertama). */
export function useActiveContainer(all = false): ExtContainer | null {
  const containers = useExtContainers().filter((c) => all || c.location !== "activitybar");
  const chosen = useStore((s) => s.layouts[s.settings.design]?.extContainer);
  return containers.find((c) => c.id === chosen) ?? containers[0] ?? null;
}

export function ContainerIcon({ c, size = 14 }: { c: ExtContainer; size?: number }) {
  if (!c.icon) return <Layers size={size} aria-hidden />;
  // Ikon SVG ekstensi biasanya satu warna: dipakai sebagai mask supaya ikut warna teks.
  return <span className="ext-container-icon" aria-hidden style={{ width: size, height: size, WebkitMaskImage: `url("${c.icon}")`, maskImage: `url("${c.icon}")` }} />;
}

/** Tab per ekstensi di panel kanan (seperti secondary sidebar VS Code). */
export function ExtContainerTabs({ all = false }: { all?: boolean }) {
  const containers = useExtContainers().filter((c) => all || c.location !== "activitybar");
  const l = useStore((s) => s.layouts[s.settings.design]);
  const active = useActiveContainer(all);
  return (
    <>
      {containers.map((c) => {
        const on = l?.rightView === "extviews" && active?.id === c.id;
        return (
          <button key={c.id} role="tab" aria-selected={on} className={`ext-container-tab ${on ? "is-on" : ""}`} title={c.title} onClick={() => setLayout({ right: true, rightView: "extviews", extContainer: c.id })}>
            <ContainerIcon c={c} size={13} />
            <span>{c.title.toUpperCase()}</span>
          </button>
        );
      })}
    </>
  );
}


/** Wadah activitybar (sidebar kiri di VS Code) untuk rail kiri. */
export function useSidebarContainers(): ExtContainer[] {
  return useExtContainers().filter((c) => c.location === "activitybar");
}
