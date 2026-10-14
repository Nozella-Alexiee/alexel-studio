import { ArrowDown, ArrowUp, Check, GitBranch, Minus, Plus, RefreshCw, Undo2, ChevronDown } from "lucide-react";
import React, { useEffect, useState } from "react";
import * as A from "../app/actions";
import { refreshHeads } from "../editor/documents";
import { FileIcon } from "../components/FileIcon";
import { openMenu } from "../components/Overlays";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/ipc";
import { join } from "../lib/paths";
import { timeAgo } from "../lib/format";
import type { Commit, GitFile } from "../lib/types";
import { confirmDialog, promptDialog, toast, useStore } from "../state/store";

const STATUS: Record<string, string> = { M: "Diubah", A: "Ditambahkan", D: "Dihapus", R: "Diganti nama", C: "Disalin", U: "Konflik", "?": "Baru" };

function letter(f: GitFile, staged: boolean): string {
  if (f.untracked) return "U";
  if (f.conflicted) return "!";
  const c = staged ? f.xy[0] : f.xy[1];
  return c === "?" ? "U" : c;
}

export default function GitPanel() {
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const gitBot = useStore((s) => s.settings.gitBot);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<Commit[]>([]);

  const repo = git?.root || root || "";
  useEffect(() => {
    if (!git?.is_repo || !repo) return setLog([]);
    let alive = true;
    api.gitLog(repo, 30).then((l) => alive && setLog(l)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [git?.is_repo, repo, git?.ahead, git?.branch, git?.files.length]);

  const run = async (label: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(label);
    try {
      const r = await fn();
      if (okMsg) void import("../components/PenguinMascot").then((m) => m.flashPenguin("sukses", 5000));
      if (okMsg) toast(okMsg + (typeof r === "string" && r && label !== "commit" ? `: ${r.split("\n").pop()}` : ""), "success");
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      return false;
    } finally {
      setBusy(null);
      await A.refreshGit();
    }
  };

  if (!root) return <Empty title="Buka folder dulu" />;
  if (!git) return <div className="pad"><Spinner /></div>;
  if (!git.is_repo) {
    return (
      <Empty icon={<GitBranch size={26} />} title="Bukan repository git" action={<button className="btn btn-primary" onClick={() => void run("init", () => api.gitInit(root), "Repo dibuat")}>Inisialisasi git</button>}>
        Folder ini belum memakai git.
      </Empty>
    );
  }

  const staged = git.files.filter((f) => f.staged);
  const changes = git.files.filter((f) => f.unstaged);

  const commit = async () => {
    if (!staged.length) {
      if (!changes.length) return toast("Tidak ada perubahan untuk di-commit.");
      if (!(await confirmDialog("Belum ada yang di-stage", "Stage semua perubahan lalu commit?", "Stage semua & commit"))) return;
      if (!(await run("stage", () => api.gitStage(repo, [])))) return;
    }
    if (!msg.trim()) return toast("Tulis pesan commit dulu.", "error");
    const ok = await run("commit", () => api.gitCommit(repo, msg.trim()), "Commit dibuat");
    if (ok) {
      setMsg("");
      refreshHeads();
    }
  };

  const showDiff = async (f: GitFile) => {
    const path = join(repo, f.path);
    const [head, cur] = await Promise.all([api.gitHead(repo, path).catch(() => null), api.readText(path).then((t) => t.content).catch(() => "")]);
    const { openCompare } = await import("./compare");
    openCompare({ title: f.path, leftLabel: "HEAD", rightLabel: "Sekarang", left: head ?? "", right: cur });
  };

  const discard = async (fs: GitFile[]) => {
    if (!fs.length) return;
    const names = fs.length === 1 ? fs[0].path : `${fs.length} berkas`;
    if (!(await confirmDialog(`Buang perubahan di ${names}?`, "Perubahan yang belum di-commit akan hilang. Berkas baru dipindah ke Trash.", "Buang", true))) return;
    const tracked = fs.filter((f) => !f.untracked).map((f) => f.path);
    const untracked = fs.filter((f) => f.untracked).map((f) => f.path);
    await run("discard", () => api.gitDiscard(repo, tracked, untracked));
  };

  const branchMenu = async (e: React.MouseEvent) => {
    const ev = { clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent;
    const b = await api.gitBranches(repo).catch(() => null);
    if (!b) return;
    openMenu(ev, [
      ...b.local.map((name) => ({ label: name === b.current ? `✓ ${name}` : name, disabled: name === b.current, run: () => void run("checkout", () => api.gitCheckout(repo, name), `Pindah ke ${name}`).then(refreshHeads) })),
      { separator: true, label: "" },
      {
        label: "Branch baru…",
        run: async () => {
          const n = await promptDialog("Branch baru", { placeholder: "fitur/nama", validate: (v) => (/^[\w./-]+$/.test(v) && !v.startsWith("-") ? null : "Nama branch tidak valid.") });
          if (n) await run("checkout", () => api.gitCheckout(repo, n, true), `Branch ${n} dibuat`);
        },
      },
    ]);
  };

  const Item = ({ f, isStaged }: { f: GitFile; isStaged: boolean }) => {
    const l = letter(f, isStaged);
    const name = f.path.split("/").pop()!;
    const dir = f.path.split("/").slice(0, -1).join("/");
    return (
      <div className={`git-row git-${l}`} onContextMenu={(e) => openMenu(e, [{ label: "Buka berkas", run: () => void A.openFile(join(repo, f.path)) }, { label: "Lihat perubahan", run: () => void showDiff(f) }, ...(!isStaged ? [{ label: "Buang perubahan", danger: true, run: () => void discard([f]) }] : [])])}>
        <button className="git-file" onClick={() => void showDiff(f)} title={`${STATUS[l] ?? l} — klik untuk melihat perubahan`}>
          <FileIcon filename={name} size={14} />
          <span className="git-name">{name}</span>
          <span className="git-dir">{dir}</span>
        </button>
        <div className="git-row-actions">
          {!isStaged && (
            <IconButton label="Buang perubahan" onClick={() => void discard([f])}>
              <Undo2 size={13} />
            </IconButton>
          )}
          <IconButton label={isStaged ? "Unstage" : "Stage"} onClick={() => void run("stage", () => (isStaged ? api.gitUnstage(repo, [f.path]) : api.gitStage(repo, [f.path])))}>
            {isStaged ? <Minus size={13} /> : <Plus size={13} />}
          </IconButton>
        </div>
        <span className="git-letter" aria-label={STATUS[l]}>{l}</span>
      </div>
    );
  };

  return (
    <div className="git-panel">
      <div className="git-branch">
        <button className="btn btn-ghost git-branch-btn" onClick={(e) => void branchMenu(e)} aria-label="Ganti branch">
          <GitBranch size={14} />
          <span>{git.branch || "HEAD"}</span>
          <ChevronDown size={12} />
        </button>
        <div className="side-actions">
          <IconButton label={`Pull${git.behind ? ` (${git.behind} di belakang)` : ""}`} onClick={() => void run("pull", () => api.gitPull(repo), "Pull selesai").then(refreshHeads)} disabled={!!busy}>
            <ArrowDown size={14} />
            {git.behind > 0 && <span className="mini-count">{git.behind}</span>}
          </IconButton>
          <IconButton label={`Push${git.ahead ? ` (${git.ahead} commit)` : ""}`} onClick={() => void run("push", () => api.gitPush(repo), "Push berhasil")} disabled={!!busy}>
            <ArrowUp size={14} />
            {git.ahead > 0 && <span className="mini-count">{git.ahead}</span>}
          </IconButton>
          <IconButton label="Muat ulang" onClick={() => void A.refreshGit()}>
            {busy ? <Spinner size={12} /> : <RefreshCw size={14} />}
          </IconButton>
        </div>
      </div>

      <div className="git-commit">
        <textarea
          className="input textarea"
          placeholder={`Pesan commit (⌘↵ untuk commit ke ${git.branch})`}
          value={msg}
          rows={2}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              void commit();
            }
          }}
          aria-label="Pesan commit"
        />
        <button className="btn btn-primary btn-block" onClick={() => void commit()} disabled={busy === "commit"}>
          <Check size={14} /> Commit{staged.length ? ` ${staged.length} berkas` : ""}
        </button>
        {gitBot !== "off" && <div className="hint">Git Bot aktif: tiap simpan → {gitBot === "push" ? "commit & push" : "commit"} berkas itu.</div>}
      </div>

      {staged.length > 0 && (
        <section className="git-section">
          <div className="git-section-head">
            <span>Di-stage</span>
            <span className="count-badge">{staged.length}</span>
            <IconButton label="Unstage semua" onClick={() => void run("stage", () => api.gitUnstage(repo, []))}>
              <Minus size={13} />
            </IconButton>
          </div>
          {staged.map((f) => (
            <Item key={"s" + f.path} f={f} isStaged />
          ))}
        </section>
      )}
      <section className="git-section">
        <div className="git-section-head">
          <span>Perubahan</span>
          <span className="count-badge">{changes.length}</span>
          {changes.length > 0 && (
            <>
              <IconButton label="Buang semua perubahan" onClick={() => void discard(changes)}>
                <Undo2 size={13} />
              </IconButton>
              <IconButton label="Stage semua" onClick={() => void run("stage", () => api.gitStage(repo, []))}>
                <Plus size={13} />
              </IconButton>
            </>
          )}
        </div>
        {changes.map((f) => (
          <Item key={"c" + f.path} f={f} isStaged={false} />
        ))}
        {!changes.length && !staged.length && <div className="hint pad-x">Bersih. Tidak ada perubahan.</div>}
      </section>

      {log.length > 0 && (
        <section className="git-section">
          <div className="git-section-head">
            <span>Riwayat</span>
          </div>
          <ol className="git-log">
            {log.map((c, i) => (
              <li key={c.sha} className="git-commit-row" title={`${c.sha}\n${c.author}`}>
                <span className={`git-node ${i === 0 ? "is-head" : ""}`} aria-hidden />
                <span className="git-subject">{c.subject}</span>
                <span className="git-time">{timeAgo(c.time_s * 1000)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
