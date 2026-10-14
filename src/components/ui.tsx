import React, { useEffect, useRef } from "react";
import { prettyKeys } from "../app/commands";
import { PenguinMascot, usePenguinVariant } from "./PenguinMascot";

export function IconButton({
  label,
  onClick,
  children,
  active,
  className = "",
  disabled,
  keys,
  tone,
}: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  disabled?: boolean;
  keys?: string;
  tone?: "run" | "danger" | "accent";
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? "is-active" : ""} ${tone ? `tone-${tone}` : ""} ${className}`}
      aria-label={label}
      aria-pressed={active}
      title={keys ? `${label} (${prettyKeys(keys)})` : label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Kbd({ keys }: { keys: string }) {
  return <kbd className="kbd">{prettyKeys(keys)}</kbd>;
}

export function Empty({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const penguin = usePenguinVariant();
  return (
    <div className="empty">
      {penguin ? (
        <div className="empty-pingu">
          <PenguinMascot variant={penguin} size={52} />
        </div>
      ) : (
        icon && <div className="empty-icon">{icon}</div>
      )}
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Pegangan geser untuk mengubah ukuran panel. */
export function Resizer({
  axis,
  value,
  min,
  max,
  onChange,
  invert,
  className = "",
}: {
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  invert?: boolean;
  className?: string;
}) {
  const start = useRef<{ pos: number; val: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { pos: axis === "x" ? e.clientX : e.clientY, val: value };
    document.body.classList.add(axis === "x" ? "resizing-x" : "resizing-y");
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const d = (axis === "x" ? e.clientX : e.clientY) - start.current.pos;
    onChange(Math.round(Math.min(max, Math.max(min, start.current.val + (invert ? -d : d)))));
  };
  const onUp = () => {
    start.current = null;
    document.body.classList.remove("resizing-x", "resizing-y");
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const dec = axis === "x" ? "ArrowLeft" : "ArrowUp";
    const inc = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (e.key === dec || e.key === inc) {
      e.preventDefault();
      const sign = (e.key === inc ? 1 : -1) * (invert ? -1 : 1);
      onChange(Math.min(max, Math.max(min, value + sign * step)));
    }
  };
  return (
    <div
      className={`resizer resizer-${axis} ${className}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    />
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "is-on" : ""} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Memuat" role="status" />;
}

/** Fokus elemen saat komponen dipasang. */
export function useAutoFocus<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) requestAnimationFrame(() => ref.current?.focus());
  }, [enabled]);
  return ref;
}

/** Highlight posisi karakter yang cocok (fuzzy). */
export function Highlighted({ text, positions }: { text: string; positions: number[] }) {
  if (!positions.length) return <>{text}</>;
  const set = new Set(positions);
  const out: React.ReactNode[] = [];
  let buf = "";
  let on = false;
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m !== on) {
      if (buf) out.push(on ? <mark key={i}>{buf}</mark> : buf);
      buf = "";
      on = m;
    }
    buf += text[i];
  }
  if (buf) out.push(on ? <mark key="end">{buf}</mark> : buf);
  return <>{out}</>;
}
