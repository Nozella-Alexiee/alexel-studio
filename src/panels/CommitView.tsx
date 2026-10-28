// Tinjau satu commit dari riwayat Git: ringkasan, berkas yang berubah, dan diff-nya,
// plus aksi cherry-pick / revert / branch / tag dari commit itu.

import { GitBranch, GitCommitHorizontal, Copy, RotateCcw, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import * as G from "../app/gitOps";
import { IconButton, Spinner } from "../components/ui";
import { useFocusTrap } from "../components/Overlays";
import { api, errMsg } from "../lib/ipc";
import { unifiedRows } from "../lib/diff";
import { tl } from "../i18n";

export const useCommitView = create<{ sha: string; subject: string } | null>(() => null);
export const openCommit = (sha: string, subject: string) => useCommitView.setState({ sha, subject }, true);
const close = () => useCommitView.setState(null, true);

interface FilePatch {
  path: string;
  patch: string;
}

/** Pisah keluaran `git show` jadi kepala commit + patch per berkas. */
export function splitShow(text: string): { header: string; files: FilePatch[] } {
  const i = text.indexOf("\ndiff --git ");
  const header = i < 0 ? text : text.slice(0, i);
  const files: FilePatch[] = [];
  if (i >= 0) {
    for (const chunk of text.slice(i + 1).split(/\n(?=diff --git )/)) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk);
      files.push({ path: m ? m[2] : "?", patch: chunk });
    }
  }
  return { header: header.trimEnd(), files };
}

function FileDiff({ f }: { f: FilePatch }) {
  const [open, setOpen] = useState(true);
  const d = useMemo(() => unifiedRows(f.patch, 600), [f.patch]);
  return (
    <section className="commit-file">
      <button className="commit-file-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="commit-file-name">{f.path}</span>
        <span className="tone-success-fg">+{d.added}</span>
        <span className="tone-danger-fg">−{d.removed}</span>
      </button>
      {open && (
        <div className="chat-diff">
          {d.rows.map((r, i) => (
            <div key={i} className={`chat-diff-row k-${r.k === "+" ? "add" : r.k === "-" ? "del" : r.k === "…" ? "gap" : "ctx"}`}>
              <span className="chat-diff-sign" aria-hidden>
                {r.k === "…" ? "⋯" : r.k}
              </span>
              <span className="chat-diff-text">{r.t}</span>
            </div>
          ))}
          {d.more > 0 && <div className="chat-diff-more">{tl("+{n} baris lagi", { n: d.more })}</div>}
        </div>
      )}
    </section>
  );
}

export function CommitViewHost() {
  const req = useCommitView();
  const box = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ header: string; files: FilePatch[]; truncated: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useFocusTrap(box, close, req);
  useEffect(() => {
    setData(null);
    setErr(null);
    if (!req) return;
    let alive = true;
    api
      .gitShowCommit(G.repoDir(), req.sha)
      .then((r) => alive && setData({ ...splitShow(r.text), truncated: r.truncated }))
      .catch((e) => alive && setErr(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [req?.sha]);
  if (!req) return null;
  const act = (fn: () => Promise<void>) => () => {
    close();
    void fn();
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog commit-view" role="dialog" aria-modal="true" aria-label={tl("Commit {sha}", { sha: req.sha.slice(0, 8) })} ref={box}>
        <div className="commit-view-head">
          <GitCommitHorizontal size={16} aria-hidden />
          <h2 className="dialog-title">{req.subject}</h2>
          <IconButton label={tl("Tutup")} onClick={close}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="commit-view-actions">
          <button className="btn btn-ghost" onClick={act(() => G.cherryPick(req.sha, req.subject))}>
            {tl("Cherry-pick")}
          </button>
          <button className="btn btn-ghost" onClick={act(() => G.revertCommit(req.sha, req.subject))}>
            <RotateCcw size={13} /> {tl("Revert")}
          </button>
          <button className="btn btn-ghost" onClick={act(() => G.createBranch(req.sha))}>
            <GitBranch size={13} /> {tl("Branch dari sini")}
          </button>
          <button className="btn btn-ghost" onClick={act(() => G.createTag(req.sha))}>
            <Tag size={13} /> {tl("Tag")}
          </button>
          <button className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(req.sha)}>
            <Copy size={13} /> {tl("Salin sha")}
          </button>
        </div>
        <div className="commit-view-body">
          {err && <div className="hint tone-danger-fg">{err}</div>}
          {!data && !err && <Spinner />}
          {data && (
            <>
              <pre className="commit-view-header">{data.header}</pre>
              {data.files.map((f) => (
                <FileDiff key={f.path} f={f} />
              ))}
              {data.truncated && <div className="hint">{tl("Diff dipotong karena terlalu besar.")}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
