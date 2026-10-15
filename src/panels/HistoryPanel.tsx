// Time-travel per berkas: geser slider untuk melihat versi lama (dari setiap simpan),
// bandingkan dengan versi sekarang, lalu pulihkan. Tanpa git.

import { History, RotateCcw, GitCompare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as docs from "../editor/documents";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api } from "../lib/ipc";
import { basename } from "../lib/paths";
import { clockTime, formatBytes, timeAgo } from "../lib/format";
import { diffStats } from "../lib/diff";
import type { Snapshot } from "../lib/types";
import { activeTab, setState, toast, useStore } from "../state/store";
import { openCompare } from "./compare";
import { prettyKeys } from "../lib/keys";
import { tl } from "../i18n";

export default function HistoryPanel() {
  const historyFor = useStore((s) => s.historyFor);
  const active = useStore((s) => activeTab(s));
  const path = historyFor ?? (active?.kind === "text" ? active.id : null);
  const dirty = useStore((s) => (path ? s.tabs[path]?.dirty : false));
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    setSnaps(null);
    setIdx(0);
    api
      .historyList(path)
      .then(setSnaps)
      .catch(() => setSnaps([]));
  }, [path, dirty]);

  const snap = snaps?.[idx];
  useEffect(() => {
    if (!path || !snap) return setContent(null);
    let alive = true;
    api.historyRead(path, snap.id).then((c) => alive && setContent(c)).catch(() => alive && setContent(null));
    return () => {
      alive = false;
    };
  }, [path, snap]);

  const current = path ? docs.currentText(path) ?? "" : "";
  const stats = useMemo(() => (content !== null ? diffStats(content, current) : null), [content, current]);

  if (!path) return <Empty icon={<History size={22} />} title={tl("Buka berkas dulu")}>{tl("Setiap kali kamu menyimpan, Alexel Studio menyimpan salinannya. Di sini kamu bisa kembali ke versi mana pun.")}</Empty>;
  if (snaps === null) return <div className="pad"><Spinner /></div>;
  if (!snaps.length) return <Empty icon={<History size={22} />} title={tl("Belum ada riwayat untuk {name}", { name: basename(path) })}>{tl("Simpan berkas ini ({keys}) dan versinya mulai tercatat.", { keys: prettyKeys("Mod+S") })}</Empty>;

  const restore = () => {
    if (content === null || !snap) return;
    if (!docs.getDoc(path)) return toast(tl("Buka berkasnya dulu untuk memulihkan."), "error");
    docs.setDocumentText(path, content);
    toast(tl("Dipulihkan ke versi {time}. Simpan untuk menetapkan, atau {keys} untuk batal.", { time: clockTime(snap.time_ms), keys: prettyKeys("Mod+Z") }), "success");
  };

  return (
    <div className="history">
      <div className="history-head">
        <strong>{basename(path)}</strong>
        <span className="hint">{snaps.length} versi tersimpan</span>
        {historyFor && (
          <button className="btn btn-sm btn-ghost" onClick={() => setState({ historyFor: null })}>
            {tl("Ikuti berkas aktif")}
          </button>
        )}
      </div>
      <div className="history-slider">
        <span className="hint">{tl("Lama")}</span>
        <input
          type="range"
          min={0}
          max={snaps.length - 1}
          value={snaps.length - 1 - idx}
          onChange={(e) => setIdx(snaps.length - 1 - Number(e.target.value))}
          aria-label={tl("Pilih versi")}
          aria-valuetext={snap ? `${timeAgo(snap.time_ms)}, ${clockTime(snap.time_ms)}` : undefined}
        />
        <span className="hint">{tl("Baru")}</span>
      </div>
      {snap && (
        <div className="history-info">
          <div>
            <div className="strong">
              {timeAgo(snap.time_ms)} · {clockTime(snap.time_ms)}
            </div>
            <div className="hint">
              {snap.lines} baris · {formatBytes(snap.size)}
              {stats && (
                <>
                  {" · dibanding sekarang "}
                  <span className="tone-success-fg">+{stats.added}</span> <span className="tone-danger-fg">−{stats.removed}</span>
                </>
              )}
            </div>
          </div>
          <span className="spacer" />
          <IconButton
            label={tl("Bandingkan dengan sekarang")}
            onClick={() =>
              content !== null &&
              openCompare({ title: `${basename(path)}: ${tl("versi {time}", { time: clockTime(snap.time_ms) })}`, filename: basename(path), leftLabel: tl("Versi {time}", { time: clockTime(snap.time_ms) }), rightLabel: tl("Sekarang"), left: content, right: current, acceptLabel: tl("Pulihkan versi ini"), onAccept: restore })
            }
          >
            <GitCompare size={14} />
          </IconButton>
          <button className="btn btn-sm btn-primary" onClick={restore} disabled={content === null}>
            <RotateCcw size={13} /> Pulihkan
          </button>
        </div>
      )}
      <ol className="history-list">
        {snaps.map((s, i) => (
          <li key={s.id}>
            <button className={`history-item ${i === idx ? "is-on" : ""}`} onClick={() => setIdx(i)}>
              <span className="history-dot" aria-hidden />
              <span>{clockTime(s.time_ms)}</span>
              <span className="hint">{timeAgo(s.time_ms)}</span>
              <span className="hint right">{tl("{n} baris", { n: s.lines })}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
