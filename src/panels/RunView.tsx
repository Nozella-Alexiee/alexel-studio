// Run & Debug (sidebar): pilih konfigurasi, mulai debug, lalu Variables, Watch, Call Stack, Breakpoints.

import { ChevronRight, Circle, Play, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { runActiveFile, runTarget } from "../app/run";
import { IconButton } from "../components/ui";
import { autoConfig, addWatch, launchJsonConfigs, loadVars, removeAllBreakpoints, removeWatch, selectFrame, setBreakpoints, startDebug, type LaunchConfig } from "../debug/debug";
import { useDebug, type Var } from "../debug/state";
import { prettyKeys } from "../lib/keys";
import { basename, relative } from "../lib/paths";
import { useStore } from "../state/store";

function Section({ title, children, actions, defaultOpen = true }: { title: string; children: React.ReactNode; actions?: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="dbg-section">
      <div className="dbg-section-head">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronRight size={12} className={`chev ${open ? "is-open" : ""}`} aria-hidden /> {title}
        </button>
        <span className="spacer" />
        {actions}
      </div>
      {open && <div className="dbg-section-body">{children}</div>}
    </section>
  );
}

function VarRow({ v, depth }: { v: Var; depth: number }) {
  const children = useDebug((s) => (v.ref ? s.vars[v.ref] : undefined));
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="dbg-var"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (!v.ref) return;
          if (!open && !children) void loadVars(v.ref);
          setOpen((x) => !x);
        }}
        title={v.type ? `${v.name}: ${v.type}` : v.name}
      >
        <span className="dbg-var-chev">{v.ref ? <ChevronRight size={11} className={`chev ${open ? "is-open" : ""}`} /> : null}</span>
        <span className="dbg-var-name">{v.name}</span>
        <span className="dbg-var-value">{v.value}</span>
      </button>
      {open && children?.map((c, i) => <VarRow key={`${c.name}-${i}`} v={c} depth={depth + 1} />)}
    </>
  );
}

export default function RunView() {
  const targets = useStore((s) => s.runTargets);
  const root = useStore((s) => s.root);
  // Konfigurasi otomatis mengikuti berkas aktif.
  useStore((s) => s.groups[s.focusedGroup]?.active ?? null);
  const status = useDebug((s) => s.status);
  const scopes = useDebug((s) => s.scopes);
  const vars = useDebug((s) => s.vars);
  const frames = useDebug((s) => s.frames);
  const frameId = useDebug((s) => s.frameId);
  const watch = useDebug((s) => s.watch);
  const bps = useDebug((s) => s.breakpoints);
  const [configs, setConfigs] = useState<LaunchConfig[]>([]);
  const [sel, setSel] = useState(0);
  const [newWatch, setNewWatch] = useState("");

  useEffect(() => {
    void launchJsonConfigs().then(setConfigs);
  }, [root]);
  const auto = autoConfig();
  const choices = [...configs, ...(auto ? [{ ...auto, name: `${auto.name} (otomatis)` }] : [])];
  const active = status === "running" || status === "paused" || status === "starting";
  const bpList = Object.entries(bps).flatMap(([p, l]) => l.map((b) => ({ path: p, ...b })));

  return (
    <>
      <div className="side-head">
        <span className="side-title">Run & Debug</span>
      </div>
      <div className="side-scroll dbg-view">
        {!active && (
          <div className="dbg-start">
            {choices.length ? (
              <>
                <div className="dbg-start-row">
                  <button className="btn btn-primary btn-sm" onClick={() => void startDebug(choices[sel])}>
                    <Play size={12} /> Mulai debug
                  </button>
                  <select className="input select" value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Konfigurasi debug">
                    {choices.map((c, i) => (
                      <option key={i} value={i}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="hint small">
                  {prettyKeys("F5")} mulai · {prettyKeys("F9")} breakpoint · klik di kiri nomor baris untuk menaruh breakpoint.
                </p>
              </>
            ) : (
              <p className="hint">Buka berkas JavaScript, TypeScript, Python, C/C++, atau Go untuk debug, atau tambahkan .vscode/launch.json.</p>
            )}
            <button className="btn btn-sm" onClick={() => void runActiveFile()}>
              Jalankan tanpa debug
            </button>
          </div>
        )}

        {active && (
          <>
            <Section title="Variabel">
              {status !== "paused" ? (
                <p className="hint pad-x">{status === "starting" ? "Memulai…" : "Program berjalan. Variabel tampil saat berhenti di breakpoint."}</p>
              ) : (
                scopes.map((sc) => (
                  <div key={sc.ref}>
                    <div className="dbg-scope">{sc.name}</div>
                    {(vars[sc.ref] ?? []).map((v, i) => (
                      <VarRow key={`${v.name}-${i}`} v={v} depth={0} />
                    ))}
                    {!vars[sc.ref] && (
                      <button className="link-btn pad-x" onClick={() => void loadVars(sc.ref)}>
                        Muat
                      </button>
                    )}
                  </div>
                ))
              )}
            </Section>
            <Section title="Watch">
              {watch.map((w, i) => (
                <div key={i} className="dbg-watch">
                  <span className="dbg-var-name">{w.expr}</span>
                  <span className={`dbg-var-value ${w.error ? "tone-danger-fg" : ""}`}>{w.value ?? "—"}</span>
                  <IconButton label="Hapus" onClick={() => removeWatch(i)}>
                    <X size={11} />
                  </IconButton>
                </div>
              ))}
              <form
                className="dbg-watch-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addWatch(newWatch);
                  setNewWatch("");
                }}
              >
                <Plus size={12} aria-hidden />
                <input className="input" placeholder="Tambah ekspresi" value={newWatch} onChange={(e) => setNewWatch(e.target.value)} aria-label="Ekspresi watch" />
              </form>
            </Section>
            <Section title="Call stack">
              {frames.length === 0 && <p className="hint pad-x">{status === "paused" ? "Tidak ada frame." : "Berjalan…"}</p>}
              {frames.map((f) => (
                <button key={f.id} className={`dbg-frame ${f.id === frameId ? "is-on" : ""}`} onClick={() => void selectFrame(f)} disabled={!f.path}>
                  <span className="dbg-frame-name">{f.name}</span>
                  <span className="dbg-frame-loc">{f.path ? `${basename(f.path)}:${f.line}` : "tanpa sumber"}</span>
                </button>
              ))}
            </Section>
          </>
        )}

        <Section
          title="Breakpoint"
          actions={
            bpList.length > 0 && (
              <IconButton label="Hapus semua breakpoint" onClick={removeAllBreakpoints}>
                <Trash2 size={12} />
              </IconButton>
            )
          }
        >
          {bpList.length === 0 && <p className="hint pad-x">Belum ada. Klik di kiri nomor baris atau tekan {prettyKeys("F9")}.</p>}
          {bpList.map((b) => (
            <div key={`${b.path}:${b.line}`} className="dbg-bp">
              <Circle size={9} className={b.verified === false ? "is-unverified" : ""} fill="currentColor" aria-hidden />
              <button className="dbg-bp-loc" onClick={() => void import("../app/actions").then((A) => A.openFile(b.path, { line: b.line }))}>
                {basename(b.path)}
                <span className="hint">:{b.line}</span>
                {root && <span className="dbg-bp-dir">{relative(root, b.path).split("/").slice(0, -1).join("/")}</span>}
              </button>
              <IconButton label="Hapus breakpoint" onClick={() => setBreakpoints(b.path, (useDebug.getState().breakpoints[b.path] ?? []).filter((x) => x.line !== b.line))}>
                <X size={11} />
              </IconButton>
            </div>
          ))}
        </Section>

        {!active && targets.length > 0 && (
          <Section title="Smart Run" defaultOpen={false}>
            <div className="run-list">
              {targets.map((t) => (
                <button key={t.id} className="run-item" onClick={() => void runTarget(t)} title={t.command}>
                  <span className={`run-kind k-${t.kind}`}>{t.kind}</span>
                  <span className="run-label">{t.label}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

