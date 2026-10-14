import { FolderOpen, GitBranch, ListTodo, Play, Search, Sparkles, TerminalSquare, Clock, HardDrive, Files } from "lucide-react";
import { useEffect, useState } from "react";
import { openPalette } from "../app/commands";
import * as A from "../app/actions";
import { openShell } from "../app/run";
import { runTarget } from "../app/run";
import { PinguHero, moodLine, usePenguinMood, usePenguinVariant } from "../components/PenguinMascot";
import { Kbd, Spinner } from "../components/ui";
import { DESIGNS } from "../design/designs";
import { api, isDemo } from "../lib/ipc";
import { basename, shortenHome } from "../lib/paths";
import { formatBytes, timeAgo } from "../lib/format";
import type { ProjectOverview } from "../lib/types";
import { setLayout, useStore } from "../state/store";
import { refreshTodos } from "./todoData";

function Welcome() {
  const recents = useStore((s) => s.recents);
  const design = useStore((s) => s.settings.design);
  const penguin = usePenguinVariant();
  return (
    <div className="welcome">
      <div className="welcome-hero">
        {penguin ? (
          <PinguHero size={150} />
        ) : (
          <div className="logo-mark" aria-hidden>
            N
          </div>
        )}
        <h1>{penguin ? "Halo! Pingu siap ngoding." : "Nozel Code"}</h1>
        <p className="hint">Editor kode untuk Mac, dengan terminal sungguhan dan Claude Code bawaan.</p>
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={() => void A.openProjectDialog()}>
            <FolderOpen size={15} /> Buka folder
          </button>
          <button className="btn" onClick={() => void openShell()}>
            <TerminalSquare size={15} /> Terminal
          </button>
        </div>
        {isDemo && <p className="hint small">Mode pratinjau browser: backend tiruan. Buka lewat aplikasi Nozel untuk berkas sungguhan.</p>}
      </div>
      <div className="welcome-grid">
        <section className="card">
          <h2 className="card-title">Project terakhir</h2>
          {recents.length ? (
            <ul className="recent-list">
              {recents.map((r) => (
                <li key={r}>
                  <button className="recent" onClick={() => void A.openProject(r)}>
                    <FolderOpen size={14} aria-hidden />
                    <span className="recent-name">{basename(r)}</span>
                    <span className="recent-path">{shortenHome(r)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Belum ada. Folder yang kamu buka akan muncul di sini.</p>
          )}
        </section>
        <section className="card">
          <h2 className="card-title">Desain</h2>
          <div className="design-mini">
            {DESIGNS.map((d) => (
              <button key={d.id} className={`design-mini-item ${d.id === design ? "is-on" : ""}`} onClick={() => A.setDesign(d.id)} aria-pressed={d.id === design}>
                <span className="swatch" style={{ background: d.swatch.bg, borderColor: d.swatch.accent }}>
                  <i style={{ background: d.swatch.accent }} />
                  <i style={{ background: d.swatch.alt }} />
                </span>
                {d.name}
              </button>
            ))}
          </div>
          <h2 className="card-title">Shortcut penting</h2>
          <ul className="shortcut-list">
            <li><Kbd keys="Mod+P" /> Buka berkas</li>
            <li><Kbd keys="Mod+K" /> Semua perintah</li>
            <li><Kbd keys="Mod+Shift+F" /> Cari di project</li>
            <li><Kbd keys="Ctrl+`" /> Terminal</li>
            <li><Kbd keys="Mod+L" /> Tanya Claude</li>
            <li><Kbd keys="Mod+R" /> Jalankan berkas</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const targets = useStore((s) => s.runTargets);
  const todos = useStore((s) => s.todos);
  const [ov, setOv] = useState<ProjectOverview | null>(null);
  const penguin = usePenguinVariant();
  const mood = usePenguinMood();

  useEffect(() => {
    if (!root) return;
    setOv(null);
    let alive = true;
    api.overview(root).then((o) => alive && setOv(o)).catch(() => {});
    if (todos === null) void refreshTodos();
    return () => {
      alive = false;
    };
  }, [root]);

  if (!root) return <Welcome />;
  const totalLang = ov?.languages.reduce((a, l) => a + l.bytes, 0) || 1;
  const tagCount = (t: string) => todos?.filter((x) => x.tag === t).length ?? 0;
  return (
    <div className="dashboard">
      {penguin && (
        <section className={`pingu-banner pb-${penguin}`}>
          <PinguHero size={penguin === "kawanan" ? 150 : 132} />
          <div>
            <h2>{mood === "sukses" ? "Mantap, semua beres!" : mood === "error" ? "Ada yang perlu dibenahi" : mood === "sibuk" ? "Pingu lagi kerja…" : "Halo lagi! Pingu siap ngoding."}</h2>
            <p className="hint">{moodLine(mood)}</p>
          </div>
        </section>
      )}
      <header className="dash-head">
        <div>
          <h1>{basename(root)}</h1>
          <p className="hint">{shortenHome(root)}</p>
        </div>
        <div className="dash-quick">
          <button className="btn" onClick={() => openPalette("")}>
            <Files size={14} /> Buka berkas <Kbd keys="Mod+P" />
          </button>
          <button className="btn" onClick={() => setLayout({ sidebar: true, sideView: "search" })}>
            <Search size={14} /> Cari
          </button>
          <button className="btn btn-claude" onClick={() => setLayout({ right: true, rightView: "claude" })}>
            <Sparkles size={14} /> Tanya Claude
          </button>
        </div>
      </header>

      <div className="dash-tiles">
        <div className="tile">
          <Files size={16} aria-hidden />
          <div className="tile-num">{ov ? ov.file_count.toLocaleString("id-ID") + (ov.truncated ? "+" : "") : "…"}</div>
          <div className="tile-label">berkas</div>
        </div>
        <div className="tile">
          <HardDrive size={16} aria-hidden />
          <div className="tile-num">{ov ? formatBytes(ov.total_bytes) : "…"}</div>
          <div className="tile-label">ukuran kode</div>
        </div>
        <div className="tile">
          <Clock size={16} aria-hidden />
          <div className="tile-num">{ov?.last_modified_ms ? timeAgo(ov.last_modified_ms) : "…"}</div>
          <div className="tile-label ellipsis" title={ov?.last_modified_file ?? ""}>{ov?.last_modified_file ?? "terakhir diubah"}</div>
        </div>
        <div className="tile">
          <GitBranch size={16} aria-hidden />
          <div className="tile-num">{git?.is_repo ? git.branch : "—"}</div>
          <div className="tile-label">{git?.is_repo ? `${git.files.length} perubahan${git.ahead ? ` · ${git.ahead} belum di-push` : ""}` : "bukan repo git"}</div>
        </div>
      </div>

      {ov && ov.languages.length > 0 && (
        <section className="card">
          <h2 className="card-title">Komposisi</h2>
          <div className="lang-bar" role="img" aria-label="Komposisi bahasa">
            {ov.languages.map((l, i) => (
              <span key={l.ext} className={`lang-seg c${i % 8}`} style={{ width: `${(l.bytes / totalLang) * 100}%` }} title={`.${l.ext} · ${formatBytes(l.bytes)}`} />
            ))}
          </div>
          <ul className="lang-legend">
            {ov.languages.map((l, i) => (
              <li key={l.ext}>
                <span className={`lang-dot c${i % 8}`} aria-hidden /> .{l.ext} <span className="hint">{l.files} berkas · {Math.round((l.bytes / totalLang) * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dash-cols">
        <section className="card">
          <h2 className="card-title">
            <Play size={14} aria-hidden /> Smart Run
          </h2>
          {targets.length ? (
            <div className="run-list">
              {targets.slice(0, 10).map((t) => (
                <button key={t.id} className="run-item" onClick={() => void runTarget(t)} title={t.command}>
                  <span className={`run-kind k-${t.kind}`}>{t.kind}</span>
                  <span className="run-label">{t.label}</span>
                  <span className="run-detail">{t.detail}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">Tidak ada script terdeteksi. Nozel membaca package.json, Cargo.toml, Makefile, composer.json, go.mod, dan lainnya.</p>
          )}
        </section>
        <section className="card">
          <h2 className="card-title">
            <ListTodo size={14} aria-hidden /> TODO
          </h2>
          {todos === null ? (
            <Spinner />
          ) : todos.length ? (
            <>
              <div className="todo-tags">
                {["TODO", "FIXME", "BUG", "HACK", "NOTE"].map((t) => tagCount(t) > 0 && <span key={t} className={`todo-tag tag-${t}`}>{t} {tagCount(t)}</span>)}
              </div>
              <ul className="todo-mini">
                {todos.slice(0, 6).map((t, i) => (
                  <li key={i}>
                    <button className="todo-line" onClick={() => void A.openFile(t.path, { line: t.line })}>
                      <span className={`todo-tag tag-${t.tag}`}>{t.tag}</span>
                      <span className="todo-text">{t.text}</span>
                      <span className="todo-loc">{t.rel}:{t.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn btn-ghost btn-sm" onClick={() => A.togglePanel("todo")}>
                Lihat papan TODO
              </button>
            </>
          ) : (
            <p className="hint">Bersih. Tidak ada TODO atau FIXME.</p>
          )}
        </section>
      </div>
    </div>
  );
}
