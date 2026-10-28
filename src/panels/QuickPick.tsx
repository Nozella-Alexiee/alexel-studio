// Quick pick untuk ekstensi (vscode.window.showQuickPick): daftar yang bisa difilter, satu atau banyak pilihan.

import { Check, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyFilter } from "../lib/fuzzy";
import { setState, useStore } from "../state/store";
import { Highlighted } from "../components/ui";
import { tl } from "../i18n";

export function QuickPickHost() {
  const qp = useStore((s) => s.quickPick);
  const [value, setValue] = useState("");
  const [sel, setSel] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qp) return;
    setValue("");
    setSel(0);
    setPicked(new Set(qp.items.flatMap((it, i) => (it.picked ? [i] : []))));
    requestAnimationFrame(() => input.current?.focus());
  }, [qp]);

  const rows = useMemo(() => {
    if (!qp) return [];
    const all = qp.items.map((it, i) => ({ it, i }));
    if (!value) return all.map((r) => ({ ...r, positions: undefined as number[] | undefined }));
    return fuzzyFilter(value, all, (r) => `${r.it.label} ${r.it.description ?? ""}`, 100).map(({ item, positions }) => ({ ...item, positions: positions.filter((p) => p < item.it.label.length) }));
  }, [qp, value]);

  useEffect(() => setSel(0), [value]);
  useEffect(() => {
    list.current?.querySelector(".pal-item.is-sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!qp) return null;
  const finish = (r: number[] | null) => {
    setState({ quickPick: null });
    qp.resolve(r);
  };
  const choose = (idx: number) => {
    const row = rows[idx];
    if (!row || row.it.separator) return;
    if (qp.canPickMany) {
      setPicked((p) => {
        const n = new Set(p);
        if (n.has(row.i)) n.delete(row.i);
        else n.add(row.i);
        return n;
      });
    } else finish([row.i]);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(null);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((v) => Math.min(rows.length - 1, v + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((v) => Math.max(0, v - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (qp.canPickMany && (e.metaKey || e.ctrlKey || picked.size)) finish([...picked].sort((a, b) => a - b));
      else choose(sel);
    } else if (e.key === " " && qp.canPickMany && !value) {
      e.preventDefault();
      choose(sel);
    }
  };

  return (
    <div className="scrim scrim-top" onMouseDown={(e) => e.target === e.currentTarget && finish(null)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={qp.title ?? qp.placeHolder ?? tl("Pilih")}>
        <div className="pal-input-row">
          {qp.title && <span className="pal-mode">{qp.title}</span>}
          <input ref={input} className="pal-input" value={value} placeholder={qp.placeHolder ?? tl("Ketik untuk menyaring…")} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off" role="combobox" aria-expanded="true" aria-label={qp.title ?? qp.placeHolder ?? tl("Pilih")} />
        </div>
        <div className="pal-list" role="listbox" ref={list}>
          {rows.map((r, i) =>
            r.it.separator ? (
              <div key={r.i} className="pal-sep">
                {r.it.label}
              </div>
            ) : (
              <div key={r.i} role="option" aria-selected={i === sel} className={`pal-item ${i === sel ? "is-sel" : ""}`} onMouseMove={() => setSel(i)} onMouseDown={(e) => (e.preventDefault(), choose(i))}>
                {qp.canPickMany && <span className={`pal-check ${picked.has(r.i) ? "is-on" : ""}`}>{picked.has(r.i) && <Check size={11} aria-hidden />}</span>}
                <span className="pal-label">{r.positions ? <Highlighted text={r.it.label} positions={r.positions} /> : r.it.label}</span>
                {r.it.description && <span className="pal-detail">{r.it.description}</span>}
                {r.it.detail && <span className="pal-detail pal-detail2">{r.it.detail}</span>}
              </div>
            )
          )}
          {!rows.length && <div className="pal-empty">{tl("Tidak ada hasil.")}</div>}
        </div>
        <div className="pal-foot">
          <span>
            <CornerDownLeft size={11} aria-hidden /> {qp.canPickMany ? tl("pilih / konfirmasi") : tl("pilih")}
          </span>
          <span>{tl("esc tutup")}</span>
        </div>
      </div>
    </div>
  );
}
