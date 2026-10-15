// Menu bar di dalam title bar untuk Windows/Linux (macOS memakai menu native di atas layar).
// Isi menu dari src/app/menus.ts, sama persis dengan menu macOS.

import { Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MENUS, resolveItems, runMenuCommand, type ResolvedItem } from "../app/menus";
import { isMac } from "../lib/ipc";
import { prettyKeys } from "../lib/keys";
import { tl } from "../i18n";

function Items({ items, onDone }: { items: ResolvedItem[]; onDone: () => void }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div className="mb-menu" role="menu">
      {items.map((it, i) =>
        it.kind === "sep" ? (
          <div key={i} className="mb-sep" role="separator" />
        ) : it.kind === "sub" ? (
          <div key={i} className="mb-subwrap" onMouseEnter={() => setSub(i)} onMouseLeave={() => setSub((v) => (v === i ? null : v))}>
            <button className="mb-item" role="menuitem" aria-haspopup="menu" aria-expanded={sub === i} onClick={() => setSub(i)}>
              <span className="mb-check" />
              <span className="mb-label">{it.label}</span>
              <ChevronRight size={12} aria-hidden />
            </button>
            {sub === i && (
              <div className="mb-submenu">
                <Items items={it.sub ?? []} onDone={onDone} />
              </div>
            )}
          </div>
        ) : (
          <button
            key={i}
            className="mb-item"
            role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={it.checked}
            disabled={it.enabled === false}
            onMouseEnter={() => setSub(null)}
            onClick={() => {
              onDone();
              if (it.id) runMenuCommand(it.id);
            }}
          >
            <span className="mb-check">{it.checked && <Check size={12} />}</span>
            <span className="mb-label">{it.label}</span>
            {it.keys && <span className="mb-keys">{prettyKeys(it.keys)}</span>}
          </button>
        )
      )}
    </div>
  );
}

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") setOpen((v) => (v === null ? v : (v + 1) % MENUS.length));
      else if (e.key === "ArrowLeft") setOpen((v) => (v === null ? v : (v + MENUS.length - 1) % MENUS.length));
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", () => setOpen(null), { once: true });
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  if (isMac) return null;
  return (
    <div className="menubar" ref={bar} role="menubar" aria-label={tl("Menu aplikasi")}>
      {MENUS.map((m, i) => (
        <div key={m.label} className="mb-top">
          <button
            className={`mb-top-btn ${open === i ? "is-open" : ""}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen((v) => (v === i ? null : i))}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && <Items items={resolveItems(m.items())} onDone={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  );
}
