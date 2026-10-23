// Menu bar di dalam title bar untuk Windows/Linux (macOS memakai menu native di atas layar).
// Isi menu dari src/app/menus.ts, sama persis dengan menu macOS.

import { Check, ChevronRight, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MENUS, resolveItems, runMenuCommand, type ResolvedItem } from "../app/menus";
import { isMac } from "../lib/ipc";
import { prettyKeys } from "../lib/keys";
import { tl } from "../i18n";

/** Klik menu tidak boleh mengambil fokus: Edit → Tempel/Urungkan harus bekerja di kolom yang sedang dipakai. */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

function Items({ items, onDone }: { items: ResolvedItem[]; onDone: () => void }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div className="mb-menu" role="menu">
      {items.map((it, i) =>
        it.kind === "sep" ? (
          <div key={i} className="mb-sep" role="separator" />
        ) : it.kind === "sub" ? (
          <div key={i} className="mb-subwrap" onMouseEnter={() => setSub(i)} onMouseLeave={() => setSub((v) => (v === i ? null : v))}>
            <button className="mb-item" role="menuitem" aria-haspopup="menu" aria-expanded={sub === i} onMouseDown={keepFocus} onClick={() => setSub(i)}>
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
            onMouseDown={keepFocus}
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
    const blur = () => setOpen(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
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
            onMouseDown={keepFocus}
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

/**
 * Menu aplikasi dalam satu tombol (☰) untuk Windows/Linux: dipakai desain yang titlebar-nya terlalu
 * sempit untuk deretan menu penuh (Aurora, Zen, Control) dan Studio di jendela sempit. Isi sama dengan MenuBar.
 */
export function MenuHamburger({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const blur = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, [open]);
  if (isMac) return null;
  const items: ResolvedItem[] = open ? MENUS.map((m) => ({ kind: "sub" as const, label: m.label, sub: resolveItems(m.items()) })) : [];
  return (
    <div className={`mb-burger ${className}`} ref={box}>
      <button className={`mb-burger-btn ${open ? "is-open" : ""}`} aria-label={tl("Menu aplikasi")} aria-haspopup="menu" aria-expanded={open} title={tl("Menu aplikasi")} onMouseDown={keepFocus} onClick={() => setOpen((v) => !v)}>
        <Menu size={16} aria-hidden />
      </button>
      {open && <Items items={items} onDone={() => setOpen(false)} />}
    </div>
  );
}
