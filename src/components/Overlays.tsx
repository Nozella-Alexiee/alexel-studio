import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { getState, setState, useStore } from "../state/store";
import { prettyKeys } from "../lib/keys";
import { tl } from "../i18n";

// ---------------- Dialog (confirm / prompt / pilihan) ----------------

/**
 * Kunci Tab di dalam dialog dan kembalikan fokus saat ditutup. Dipasang SEKALI per dialog terbuka
 * (bukan tiap render), supaya fokus tidak dilempar balik ke editor saat pengguna mengetik.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, onEscape: () => void, active: unknown) {
  const esc = useRef(onEscape);
  esc.current = onEscape;
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        esc.current();
      } else if (e.key === "Tab") {
        const f = el.querySelectorAll<HTMLElement>('button, input, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [ref, active]);
}

export function DialogHost() {
  const d = useStore((s) => s.dialog);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!d) return;
    setValue(d.defaultValue ?? "");
    setError(null);
    requestAnimationFrame(() => {
      if (d.kind === "prompt" && input.current) {
        input.current.focus();
        const v = d.defaultValue ?? "";
        const dot = v.lastIndexOf(".");
        input.current.setSelectionRange(0, dot > 0 ? dot : v.length);
      } else okBtn.current?.focus();
    });
  }, [d]);

  const close = (v: string | boolean | null) => {
    const cur = getState().dialog;
    setState({ dialog: null });
    cur?.resolve(v);
  };
  useFocusTrap(box, () => close(null), d);
  if (!d) return null;

  const submit = () => {
    if (d.kind === "prompt") {
      const err = d.validate?.(value) ?? (value.trim() ? null : tl("Isi dulu."));
      if (err) return setError(err);
      close(value.trim());
    } else close(true);
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={box}>
        <h2 id="dlg-title" className="dialog-title">
          {d.danger && <AlertTriangle size={16} className="tone-danger-fg" aria-hidden />}
          {d.title}
        </h2>
        {d.message && <p className="dialog-msg">{d.message}</p>}
        {d.detail && <pre className="dialog-detail">{d.detail}</pre>}
        {d.kind === "prompt" && (
          <div className="field">
            <input
              ref={input}
              aria-labelledby="dlg-title"
              className={`input ${error ? "has-error" : ""}`}
              value={value}
              placeholder={d.placeholder}
              aria-invalid={!!error}
              aria-describedby={error ? "dlg-err" : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && (
              <div id="dlg-err" className="field-error">
                {error}
              </div>
            )}
          </div>
        )}
        <div className="dialog-actions">
          {d.kind === "choice" ? (
            <>
              <button className="btn" onClick={() => close(null)}>
                {d.cancelLabel ?? tl("Batal")}
              </button>
              {d.choices?.map((c, i) => (
                <button key={c.id} ref={i === 0 ? okBtn : undefined} className={`btn ${c.danger ? "btn-danger" : i === 0 ? "btn-primary" : ""}`} onClick={() => close(c.id)}>
                  {c.label}
                </button>
              ))}
            </>
          ) : (
            <>
              {d.cancelLabel !== "" && (
                <button className="btn" onClick={() => close(null)}>
                  {d.cancelLabel ?? tl("Batal")}
                </button>
              )}
              <button ref={okBtn} className={`btn ${d.danger ? "btn-danger" : "btn-primary"}`} onClick={submit}>
                {d.okLabel ?? "OK"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Toast ----------------

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === "success" ? <CheckCircle2 size={15} aria-hidden /> : t.kind === "error" ? <AlertTriangle size={15} aria-hidden /> : <Info size={15} aria-hidden />}
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="btn btn-sm"
              onClick={() => {
                t.action!.run();
                setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-x" aria-label={tl("Tutup notifikasi")} onClick={() => setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Menu klik kanan ----------------

export interface MenuItem {
  label: string;
  run?: () => void;
  keys?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

const useMenu = create<{ x: number; y: number; items: MenuItem[] } | { items: null }>(() => ({ items: null }));

export function openMenu(e: React.MouseEvent | MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  // Dibuka lewat keyboard (Enter/Spasi) → tidak ada koordinat mouse; tempelkan ke elemen pemicunya.
  let x = e.clientX;
  let y = e.clientY;
  const el = e.currentTarget as HTMLElement | null;
  if (!x && !y && el?.getBoundingClientRect) {
    const r = el.getBoundingClientRect();
    x = r.left;
    y = r.bottom + 4 > window.innerHeight - 40 ? r.top : r.bottom + 4;
  }
  useMenu.setState({ x, y, items });
}

export function ContextMenuHost() {
  const m = useMenu();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!m.items) return;
    const close = () => useMenu.setState({ items: null });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [m.items]);
  useEffect(() => {
    if (!m.items || !("x" in m)) return setPos(null);
    requestAnimationFrame(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ x: Math.min(m.x, window.innerWidth - r.width - 8), y: Math.min(m.y, window.innerHeight - r.height - 8) });
      ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  }, [m]);
  if (!m.items || !("x" in m)) return null;
  return (
    <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos?.x ?? m.x, top: pos?.y ?? m.y, visibility: pos ? "visible" : "hidden" }} onMouseDown={(e) => e.stopPropagation()}>
      {m.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item ${it.danger ? "is-danger" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              useMenu.setState({ items: null });
              it.run?.();
            }}
          >
            <span>{it.label}</span>
            {it.keys && <span className="ctx-keys">{prettyKeys(it.keys)}</span>}
          </button>
        )
      )}
    </div>
  );
}
