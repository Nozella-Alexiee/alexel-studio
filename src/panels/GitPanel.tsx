import { Archive, ArrowDown, ArrowUp, Check, GitBranch, Minus, MoreHorizontal, Plus, RefreshCw, Sparkles, Undo2, ChevronDown } from "lucide-react";
import React, { useEffect, useState } from "react";
import * as A from "../app/actions";
import * as G from "../app/gitOps";
import { layoutGraph, type GraphRow } from "../lib/gitGraph";
import { openCommit } from "./CommitView";
import { refreshHeads } from "../editor/documents";
import { FileIcon } from "../components/FileIcon";
import { openMenu } from "../components/Overlays";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/ipc";
import { join } from "../lib/paths";
import { timeAgo } from "../lib/format";
import type { Commit, GitFile, GitOp, StashEntry } from "../lib/types";
import { ask, confirmDialog, getState, toast, useStore } from "../state/store";
import { prettyKeys, modKey } from "../lib/keys";
import { tl } from "../i18n";

const STATUS: Record<string, string> = { M: tl("Diubah"), A: tl("Ditambahkan"), D: tl("Dihapus"), R: tl("Diganti nama"), C: tl("Disalin"), U: tl("Konflik"), "?": tl("Baru") };

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
  const [writing, setWriting] = useState<string | null>(null);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [op, setOp] = useState<{ op: GitOp | null; conflicts: number }>({ op: null, conflicts: 0 });

  /** ✨ Tulis pesan commit dengan agen AI dari diff yang di-stage (atau semua perubahan). */
  const writeMessage = async () => {
    if (writing) {
      void api.agentOnceCancel(writing).catch((e) => toast(tl("Gagal membatalkan agen: {error}", { error: errMsg(e) }), "error"));
      setWriting(null);
      return;
    }
    const { ensureConsent, agentNow } = await import("../claude/claude");
    if (!(await ensureConsent())) return;
    const C = await import("../app/commitMessage");
    const runId = `commit-${Date.now().toString(36)}`;
    setWriting(runId);
    try {
      const ctx = await api.gitCommitContext(repo);
      if (!ctx.diff.trim()) return toast(C.noChangesMessage());
      const prompt = C.buildCommitPrompt(ctx, msg);
      if (getState().settings.claudeConfirm && !(await ask({ kind: "confirm", title: tl("Kirim diff ke agen AI?"), message: tl("Diff berikut dikirim untuk menulis pesan commit."), detail: prompt, okLabel: tl("Kirim") }))) return;
      const text = C.cleanCommitMessage(await api.agentOnce(agentNow(), runId, repo, prompt));
      if (text) setMsg(text);
      else toast(tl("Agen tidak memberi pesan commit."), "info");
    } catch (e) {
      if (!/Dibatalkan/.test(errMsg(e))) toast(errMsg(e), "error");
    } finally {
      setWriting((w) => (w === runId ? null : w));
    }
  };

  const repo = git?.root || root || "";
  useEffect(() => {
    if (!git?.is_repo || !repo) return setLog([]);
    let alive = true;
    api.gitLog(repo, 80, true).then((l) => alive && setLog(l)).catch(() => {});
    api.gitStashList(repo).then((l) => alive && setStashes(l)).catch(() => alive && setStashes([]));
    api.gitOpState(repo).then((o) => alive && setOp(o)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [git?.is_repo, repo, git?.ahead, git?.behind, git?.branch, git?.files]);

  const run = async (label: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(label);
    try {
      const r = await fn();
      if (okMsg) void import("../components/PenguinMascot").then((m) => m.flashPenguin(label === "commit" ? "jempol" : "sukses", 5000));
      if (okMsg) toast(okMsg + (typeof r === "string" && r && label !== "commit" ? `: ${r.split("\n").pop()}` : ""), "success");
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      void import("../components/PenguinMascot").then((m) => m.flashPenguin("error", 5000));
      return false;
    } finally {
      setBusy(null);
      await A.refreshGit();
    }
  };

  if (!root) return <Empty title={tl("Buka folder dulu")} />;
  if (!git) return <div className="pad"><Spinner /></div>;
  if (!git.is_repo) {
    return (
      <Empty icon={<GitBranch size={26} />} title={tl("Bukan repository git")} action={<button className="btn btn-primary" onClick={() => void run("init", () => api.gitInit(root), tl("Repo dibuat"))}>{tl("Inisialisasi git")}</button>}>
        {tl("Folder ini belum memakai git.")}
      </Empty>
    );
  }

  const staged = git.files.filter((f) => f.staged);
  const changes = git.files.filter((f) => f.unstaged);

  const commit = async () => {
    // Cek pesan dulu, supaya tidak ada "git add -A" yang tertinggal saat commit dibatalkan.
    if (!msg.trim()) return toast(tl("Tulis pesan commit dulu."), "error");
    if (!staged.length) {
      if (!changes.length) return toast(tl("Tidak ada perubahan untuk di-commit."));
      if (!(await confirmDialog(tl("Belum ada yang di-stage"), tl("Stage semua perubahan lalu commit?"), tl("Stage semua & commit")))) return;
      if (!(await run("stage", () => api.gitStage(repo, [])))) return;
    }
    const ok = await run("commit", () => api.gitCommit(repo, msg.trim()), tl("Commit dibuat"));
    if (ok) {
      setMsg("");
      refreshHeads();
    }
  };

  const showDiff = async (f: GitFile) => {
    const path = join(repo, f.path);
    const [head, cur] = await Promise.all([api.gitHead(repo, path).catch(() => null), api.readText(path).then((t) => t.content).catch(() => "")]);
    const { openCompare } = await import("./compare");
    openCompare({ title: f.path, leftLabel: "HEAD", rightLabel: tl("Sekarang"), left: head ?? "", right: cur });
  };

  const discard = async (fs: GitFile[]) => {
    if (!fs.length) return;
    const names = fs.length === 1 ? fs[0].path : tl("{n} berkas", { n: fs.length });
    if (!(await confirmDialog(tl("Buang perubahan di {names}?", { names }), tl("Perubahan yang belum di-commit akan hilang. Berkas baru dipindah ke Trash."), tl("Buang"), true))) return;
    const tracked = fs.filter((f) => !f.untracked).map((f) => f.path);
    const untracked = fs.filter((f) => f.untracked).map((f) => f.path);
    await run("discard", () => api.gitDiscard(repo, tracked, untracked));
  };

  const branchMenu = async (e: React.MouseEvent) => {
    const ev = { clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent;
    const b = await api.gitBranches(repo).catch(() => null);
    if (!b) return;
    openMenu(ev, [
      ...b.local.map((name) => ({ label: name === b.current ? `✓ ${name}` : name, disabled: name === b.current, run: () => void run("checkout", () => api.gitCheckout(repo, name), tl("Pindah ke {name}", { name })).then(refreshHeads) })),
      { separator: true, label: "" },
      { label: tl("Branch baru…"), run: () => void G.createBranch() },
      { label: tl("Ganti nama branch ini…"), run: () => void G.renameBranch() },
      { label: tl("Hapus branch…"), danger: true, run: () => void G.deleteBranch() },
    ]);
  };

  const moreMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: "Fetch", run: () => void G.fetchAll() },
      { label: tl("Merge branch ke {branch}…", { branch: git.branch || "HEAD" }), run: () => void G.mergeBranch() },
      { label: tl("Rebase ke…"), run: () => void G.rebaseBranch() },
      { separator: true, label: "" },
      { label: tl("Stash perubahan…"), disabled: !git.files.length, run: () => void G.stashChanges() },
      { label: tl("Terapkan stash terakhir (pop)"), disabled: !stashes.length, run: () => void G.popLatestStash() },
      { separator: true, label: "" },
      { label: tl("Buat tag…"), run: () => void G.createTag() },
      { label: tl("Hapus tag…"), run: () => void G.deleteTag() },
      { separator: true, label: "" },
      { label: tl("Commit ulang (amend) dengan pesan ini"), run: () => void run("commit", () => api.gitCommit(repo, msg.trim(), true), tl("Commit diperbarui")).then((ok) => ok && setMsg("")) },
    ]);

  const Item = ({ f, isStaged }: { f: GitFile; isStaged: boolean }) => {
    const l = letter(f, isStaged);
    const name = f.path.split("/").pop()!;
    const dir = f.path.split("/").slice(0, -1).join("/");
    return (
      <div className={`git-row git-${l}`} onContextMenu={(e) => openMenu(e, [{ label: tl("Buka berkas"), run: () => void A.openFile(join(repo, f.path)) }, { label: tl("Lihat perubahan"), run: () => void showDiff(f) }, ...(!isStaged ? [{ label: tl("Buang perubahan"), danger: true, run: () => void discard([f]) }] : [])])}>
        <button className="git-file" onClick={() => void showDiff(f)} title={`${STATUS[l] ?? l} — ${tl("klik untuk melihat perubahan")}`}>
          <FileIcon filename={name} size={14} />
          <span className="git-name">{name}</span>
          <span className="git-dir">{dir}</span>
        </button>
        <div className="git-row-actions">
          {!isStaged && (
            <IconButton label={tl("Buang perubahan")} onClick={() => void discard([f])}>
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
        <button className="btn btn-ghost git-branch-btn" onClick={(e) => void branchMenu(e)} aria-label={tl("Ganti branch")}>
          <GitBranch size={14} />
          <span>{git.branch || "HEAD"}</span>
          <ChevronDown size={12} />
        </button>
        <div className="side-actions">
          <IconButton label={`Pull${git.behind ? ` (${tl("{n} di belakang", { n: git.behind })})` : ""}`} onClick={() => void run("pull", () => api.gitPull(repo), tl("Pull selesai")).then(refreshHeads)} disabled={!!busy}>
            <ArrowDown size={14} />
            {git.behind > 0 && <span className="mini-count">{git.behind}</span>}
          </IconButton>
          <IconButton label={`Push${git.ahead ? ` (${git.ahead} commit)` : ""}`} onClick={() => void run("push", () => api.gitPush(repo), tl("Push berhasil"))} disabled={!!busy}>
            <ArrowUp size={14} />
            {git.ahead > 0 && <span className="mini-count">{git.ahead}</span>}
          </IconButton>
          <IconButton label={tl("Muat ulang")} onClick={() => void A.refreshGit()}>
            {busy ? <Spinner size={12} /> : <RefreshCw size={14} />}
          </IconButton>
          <IconButton label={tl("Aksi Git lainnya")} onClick={moreMenu}>
            <MoreHorizontal size={14} />
          </IconButton>
        </div>
      </div>

      {op.op && (
        <div className="git-op-banner" role="status">
          <span>
            {tl("{op} sedang berjalan", { op: op.op })}
            {op.conflicts > 0 ? ` · ${tl("{n} berkas konflik", { n: op.conflicts })}` : ` · ${tl("konflik selesai, stage lalu lanjutkan")}`}
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => void G.continueOp()} disabled={op.conflicts > 0}>
            {tl("Lanjutkan")}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void G.abortOp()}>
            {tl("Batalkan")}
          </button>
        </div>
      )}

      <div className="git-commit">
        <div className="git-commit-box">
        <textarea
          className="input textarea"
          placeholder={tl("Pesan commit ({keys} untuk commit ke {branch})", { keys: prettyKeys("Mod+Enter"), branch: git.branch })}
          value={msg}
          rows={2}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && modKey(e)) {
              e.preventDefault();
              void commit();
            }
          }}
          aria-label={tl("Pesan commit")}
        />
          <button
            className={`git-ai-btn ${writing ? "is-busy" : ""}`}
            onClick={() => void writeMessage()}
            disabled={!git.files.length && !writing}
            title={writing ? tl("Batalkan") : tl("Tulis pesan commit dengan AI")}
            aria-label={writing ? tl("Batalkan") : tl("Tulis pesan commit dengan AI")}
          >
            {writing ? <Spinner size={12} /> : <Sparkles size={14} />}
          </button>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => void commit()} disabled={busy === "commit"}>
          <Check size={14} /> Commit{staged.length ? ` ${tl("{n} berkas", { n: staged.length })}` : ""}
        </button>
        {gitBot !== "off" && <div className="hint">{tl("Git Bot aktif: tiap simpan → {what} berkas itu.", { what: gitBot === "push" ? "commit & push" : "commit" })}</div>}
      </div>

      {staged.length > 0 && (
        <section className="git-section">
          <div className="git-section-head">
            <span>{tl("Di-stage")}</span>
            <span className="count-badge">{staged.length}</span>
            <IconButton label={tl("Unstage semua")} onClick={() => void run("stage", () => api.gitUnstage(repo, []))}>
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
          <span>{tl("Perubahan")}</span>
          <span className="count-badge">{changes.length}</span>
          {changes.length > 0 && (
            <>
              <IconButton label={tl("Buang semua perubahan")} onClick={() => void discard(changes)}>
                <Undo2 size={13} />
              </IconButton>
              <IconButton label={tl("Stage semua")} onClick={() => void run("stage", () => api.gitStage(repo, []))}>
                <Plus size={13} />
              </IconButton>
            </>
          )}
        </div>
        {changes.map((f) => (
          <Item key={"c" + f.path} f={f} isStaged={false} />
        ))}
        {!changes.length && !staged.length && <div className="hint pad-x">{tl("Bersih. Tidak ada perubahan.")}</div>}
      </section>

      {stashes.length > 0 && (
        <section className="git-section">
          <div className="git-section-head">
            <span>Stash</span>
            <span className="count-badge">{stashes.length}</span>
          </div>
          {stashes.map((st) => (
            <div key={st.ref} className="git-row" onContextMenu={(e) => openMenu(e, [{ label: tl("Terapkan"), run: () => void G.applyStash(st.ref, false) }, { label: tl("Terapkan & buang (pop)"), run: () => void G.applyStash(st.ref, true) }, { label: tl("Buang"), danger: true, run: () => void G.dropStash(st.ref) }])}>
              <span className="git-file git-stash" title={st.ref}>
                <Archive size={13} aria-hidden />
                <span className="git-name">{st.message || st.ref}</span>
                <span className="git-dir">{timeAgo(st.time_s * 1000)}</span>
              </span>
              <div className="git-row-actions">
                <IconButton label={tl("Terapkan & buang (pop)")} onClick={() => void G.applyStash(st.ref, true)}>
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton label={tl("Buang")} onClick={() => void G.dropStash(st.ref)}>
                  <Minus size={13} />
                </IconButton>
              </div>
            </div>
          ))}
        </section>
      )}

      {log.length > 0 && <History log={log} />}
    </div>
  );
}

const ROW_H = 24;
const LANE_W = 12;
const LANE_COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--info, var(--accent))", "var(--danger)"];
const laneX = (i: number) => LANE_W / 2 + i * LANE_W + 2;
const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

/** Satu baris graph: garis lewat, garis masuk ke titik, garis keluar ke parent, lalu titik commit. */
function GraphCell({ row, width, head }: { row: GraphRow; width: number; head: boolean }) {
  const mid = ROW_H / 2;
  const x = laneX(row.lane);
  return (
    <svg className="git-graph-cell" width={laneX(width - 1) + LANE_W / 2 + 2} height={ROW_H} aria-hidden>
      {row.through.map((i) => (
        <line key={`t${i}`} x1={laneX(i)} y1={0} x2={laneX(i)} y2={ROW_H} stroke={laneColor(i)} />
      ))}
      {row.into.map((i) => (
        <line key={`i${i}`} x1={laneX(i)} y1={0} x2={x} y2={mid} stroke={laneColor(i)} />
      ))}
      {row.out.map((i) => (
        <line key={`o${i}`} x1={x} y1={mid} x2={laneX(i)} y2={ROW_H} stroke={laneColor(i)} />
      ))}
      <circle cx={x} cy={mid} r={head ? 4.5 : 3.5} fill={head ? laneColor(row.lane) : "var(--surface-1)"} stroke={laneColor(row.lane)} strokeWidth={2} />
    </svg>
  );
}

function History({ log }: { log: Commit[] }) {
  const rows = React.useMemo(() => layoutGraph(log), [log]);
  const width = Math.min(8, Math.max(1, ...rows.map((r) => r.width)));
  return (
    <section className="git-section">
      <div className="git-section-head">
        <span>{tl("Riwayat")}</span>
      </div>
      <ol className="git-log git-graph">
        {log.map((c, i) => {
          const refs = c.refs.split(", ").filter(Boolean).map((r) => r.replace(/^HEAD -> /, "").replace(/^tag: /, "🏷 "));
          return (
            <li key={c.sha}>
              <button
                className="git-commit-row"
                title={`${c.short} · ${c.author}\n${c.subject}`}
                onClick={() => openCommit(c.sha, c.subject)}
                onContextMenu={(e) =>
                  openMenu(e, [
                    { label: tl("Lihat commit"), run: () => openCommit(c.sha, c.subject) },
                    { label: tl("Cherry-pick"), run: () => void G.cherryPick(c.sha, c.subject) },
                    { label: tl("Revert"), run: () => void G.revertCommit(c.sha, c.subject) },
                    { label: tl("Branch dari sini…"), run: () => void G.createBranch(c.sha) },
                    { label: tl("Tag di sini…"), run: () => void G.createTag(c.sha) },
                    { label: tl("Salin sha"), run: () => void navigator.clipboard.writeText(c.sha) },
                  ])
                }
              >
                <GraphCell row={rows[i]} width={width} head={/HEAD/.test(c.refs) || (i === 0 && !log.some((x) => /HEAD/.test(x.refs)))} />
                {refs.map((r) => (
                  <span key={r} className="git-ref">{r}</span>
                ))}
                <span className="git-subject">{c.subject}</span>
                <span className="git-time">{timeAgo(c.time_s * 1000)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
