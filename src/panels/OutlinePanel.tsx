// Outline: simbol berkas aktif (fungsi, kelas, tipe, judul). Klik untuk lompat; simbol di posisi kursor disorot.

import { useEffect, useMemo, useState } from "react";
import * as docs from "../editor/documents";
import { extractSymbols } from "../editor/symbols";
import { activeTab, getState, useStore } from "../state/store";
import { tl } from "../i18n";

export function useDocVersion(path?: string) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!path) return;
    let t = 0;
    const off = docs.onDocTextChange((p) => {
      if (p !== path) return;
      clearTimeout(t);
      t = window.setTimeout(() => setV((x) => x + 1), 600);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [path]);
  return v;
}

const KIND_MARK: Record<string, string> = { judul: "#", kelas: "◇", struct: "◇", tipe: "T", konstanta: "π", modul: "▣", metode: "ƒ", fungsi: "ƒ" };

export function Outline() {
  const tab = useStore((s) => activeTab(s));
  const cursorLine = useStore((s) => s.cursor.line);
  const version = useDocVersion(tab?.kind === "text" ? tab.id : undefined);
  const syms = useMemo(() => {
    if (tab?.kind !== "text") return [];
    const d = docs.getDoc(tab.id);
    return d ? extractSymbols(d.langId, docs.currentText(tab.id) ?? "") : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id, tab?.kind, version]);
  if (tab?.kind !== "text") return <div className="hint pad-x">{tl("Buka berkas untuk melihat strukturnya.")}</div>;
  if (!syms.length) return <div className="hint pad-x">{tl("Tidak ada simbol di berkas ini.")}</div>;
  const current = [...syms].reverse().find((s) => s.line <= cursorLine);
  return (
    <ul className="zen-outline" aria-label="Outline">
      {syms.slice(0, 400).map((s, i) => (
        <li key={i}>
          <button className={`zen-sym ${s === current ? "is-on" : ""}`} style={{ paddingLeft: 10 + s.depth * 10 }} onClick={() => docs.revealPosition(getState().focusedGroup, s.line)} title={`${s.kind} · baris ${s.line}`}>
            <span className="zen-kind">{KIND_MARK[s.kind] ?? "ƒ"}</span>
            {s.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function OutlinePanel() {
  return (
    <>
      <div className="side-head">
        <span className="side-title">Outline</span>
      </div>
      <div className="side-scroll">
        <Outline />
      </div>
    </>
  );
}
