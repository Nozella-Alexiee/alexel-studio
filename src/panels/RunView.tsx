// Run & Debug (sidebar). Debugger lengkap ada di src/debug; tampilan ini menampilkan
// konfigurasi, tombol mulai, dan target Smart Run.

import { Play } from "lucide-react";
import { runActiveFile, runTarget } from "../app/run";
import { useStore } from "../state/store";

export default function RunView() {
  const targets = useStore((s) => s.runTargets);
  return (
    <>
      <div className="side-head">
        <span className="side-title">Run & Debug</span>
      </div>
      <div className="side-scroll pad-x">
        <button className="btn btn-primary" onClick={() => void runActiveFile()}>
          <Play size={13} /> Jalankan berkas aktif
        </button>
        <h3 className="side-sub">Smart Run</h3>
        {targets.length ? (
          <div className="run-list">
            {targets.map((t) => (
              <button key={t.id} className="run-item" onClick={() => void runTarget(t)} title={t.command}>
                <span className={`run-kind k-${t.kind}`}>{t.kind}</span>
                <span className="run-label">{t.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="hint">Tidak ada target terdeteksi di project ini.</p>
        )}
      </div>
    </>
  );
}
