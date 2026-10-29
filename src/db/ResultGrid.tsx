// Grid hasil query/tabel: baris virtual (hanya yang terlihat dirender), kolom bisa diurutkan & difilter,
// sel bisa disalin, dan (bila diberi onEdit) diedit dengan klik ganda.

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { tl } from "../i18n";
import { toast } from "../state/store";

const ROW_H = 24;

export interface GridProps {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  /** Kolom PK (penanda kunci di header). */
  pk?: string[];
  sort?: { col: string; desc: boolean } | null;
  onSort?: (col: string) => void;
  filters?: Record<string, string>;
  onFilter?: (col: string, value: string) => void;
  onEdit?: (row: number, col: number, value: string | null) => void;
  onDelete?: (row: number) => void;
  /** Nomor baris pertama (paginasi). */
  offset?: number;
}

export const showCell = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

function widths(columns: GridProps["columns"], rows: unknown[][]) {
  return columns.map((c, i) => {
    let n = c.name.length + 3;
    for (const r of rows.slice(0, 80)) n = Math.max(n, Math.min(48, showCell(r[i]).length));
    return Math.max(70, Math.min(380, n * 7.4 + 18));
  });
}

export function ResultGrid({ columns, rows, pk = [], sort, onSort, filters, onFilter, onEdit, onDelete, offset = 0 }: GridProps) {
  const box = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const w = useMemo(() => widths(columns, rows), [columns, rows]);
  const template = `48px ${w.map((x) => `${x}px`).join(" ")}${onDelete ? " 32px" : ""}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setSel(null), [rows]);

  const head = onFilter ? 2 : 1;
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 5);
  const last = Math.min(rows.length, Math.ceil((scroll + height) / ROW_H) + 5);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast(tl("Disalin"), "success"));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (editing || !sel) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copy(showCell(rows[sel.r]?.[sel.c]));
      return;
    }
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const r = Math.max(0, Math.min(rows.length - 1, sel.r + dr));
      const c = Math.max(0, Math.min(columns.length - 1, sel.c + dc));
      setSel({ r, c });
      const el = box.current;
      if (el) {
        const top = (r + head) * ROW_H;
        if (top < el.scrollTop + head * ROW_H) el.scrollTop = top - head * ROW_H;
        else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
      }
    };
    if (e.key === "ArrowDown") move(1, 0);
    else if (e.key === "ArrowUp") move(-1, 0);
    else if (e.key === "ArrowLeft") move(0, -1);
    else if (e.key === "ArrowRight" || e.key === "Tab") move(0, 1);
    else if ((e.key === "Enter" || e.key === "F2") && onEdit) {
      e.preventDefault();
      const v = rows[sel.r]?.[sel.c];
      setEditing({ ...sel, value: v === null || v === undefined ? "" : showCell(v) });
    }
  };
  const commit = (value: string | null) => {
    if (!editing) return;
    const old = rows[editing.r]?.[editing.c];
    setEditing(null);
    if (value === (old === null || old === undefined ? null : showCell(old))) return;
    onEdit?.(editing.r, editing.c, value);
  };

  return (
    <div className="db-grid" ref={box} tabIndex={0} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} onKeyDown={onKey} role="grid" aria-rowcount={rows.length} aria-colcount={columns.length}>
      <div className="db-grid-inner" style={{ height: (rows.length + head) * ROW_H, gridTemplateColumns: template }}>
        <div className="db-grid-head" style={{ gridTemplateColumns: template }} role="row">
          <div className="db-cell db-rownum">#</div>
          {columns.map((c) => (
            <button key={c.name} className="db-cell db-hcell" role="columnheader" onClick={() => onSort?.(c.name)} title={`${c.name}${c.type ? ` · ${c.type}` : ""}`} disabled={!onSort}>
              {pk.includes(c.name) && <span className="db-pk">PK</span>}
              <span className="db-hname">{c.name}</span>
              {c.type && <span className="db-htype">{c.type}</span>}
              {sort?.col === c.name && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
            </button>
          ))}
          {onDelete && <div className="db-cell" />}
        </div>
        {onFilter && (
          <div className="db-grid-head db-grid-filter" style={{ gridTemplateColumns: template, top: ROW_H }} role="row">
            <div className="db-cell db-rownum" />
            {columns.map((c) => (
              <input key={c.name} className="db-cell db-filter" placeholder={tl("filter")} aria-label={tl("Filter {name}", { name: c.name })} defaultValue={filters?.[c.name] ?? ""} onKeyDown={(e) => e.key === "Enter" && onFilter(c.name, e.currentTarget.value)} onBlur={(e) => (filters?.[c.name] ?? "") !== e.currentTarget.value && onFilter(c.name, e.currentTarget.value)} />
            ))}
            {onDelete && <div className="db-cell" />}
          </div>
        )}
        {rows.slice(first, last).map((row, k) => {
          const r = first + k;
          return (
            <div key={r} className={`db-row ${sel?.r === r ? "is-sel" : ""}`} style={{ top: (r + head) * ROW_H, gridTemplateColumns: template }} role="row">
              <div className="db-cell db-rownum">{offset + r + 1}</div>
              {columns.map((_, c) => {
                const v = row[c];
                if (editing?.r === r && editing.c === c)
                  return (
                    <input
                      key={c}
                      className="db-cell db-edit"
                      aria-label={tl("Nilai baru {name}", { name: columns[c].name })}
                      autoFocus
                      defaultValue={editing.value}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit(e.currentTarget.value);
                        else if (e.key === "Escape") setEditing(null);
                        else if (e.key === "Backspace" && (e.metaKey || e.ctrlKey) && e.shiftKey) commit(null);
                      }}
                      onBlur={() => setEditing(null)}
                      title={tl("Enter = simpan · Esc = batal · Mod+Shift+Backspace = NULL")}
                    />
                  );
                const text = showCell(v);
                return (
                  <div
                    key={c}
                    className={`db-cell ${v === null || v === undefined ? "is-null" : typeof v === "number" ? "is-num" : ""} ${sel?.r === r && sel.c === c ? "is-focus" : ""}`}
                    role="gridcell"
                    title={text.length > 40 ? text.slice(0, 2000) : undefined}
                    onMouseDown={() => setSel({ r, c })}
                    onDoubleClick={() => onEdit && setEditing({ r, c, value: v === null || v === undefined ? "" : text })}
                  >
                    {text.length > 300 ? text.slice(0, 300) + "…" : text}
                  </div>
                );
              })}
              {onDelete && (
                <button className="db-cell db-del" onClick={() => onDelete(r)} aria-label={tl("Hapus baris {n}", { n: offset + r + 1 })} title={tl("Hapus baris")}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = showCell(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function asCsv(columns: { name: string }[], rows: unknown[][]) {
  return [columns.map((c) => csvCell(c.name)).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}
export function asJson(columns: { name: string }[], rows: unknown[][]) {
  return JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i]]))), null, 2);
}
export function asMarkdown(columns: { name: string }[], rows: unknown[][]) {
  const esc = (v: unknown) => showCell(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [`| ${columns.map((c) => esc(c.name)).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}
