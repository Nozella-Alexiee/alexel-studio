import { AlertCircle, AlertTriangle, Cpu, GitBranch, Leaf, Palette, Sparkles, ArrowUp, ArrowDown, Play } from "lucide-react";
import React, { Suspense, lazy, useEffect, useState } from "react";
import * as A from "../app/actions";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PinguStatus } from "../components/PenguinMascot";
import { openMenu } from "../components/Overlays";
import { Resizer, Spinner } from "../components/ui";
import { DESIGNS, designById } from "../design/designs";
import { EditorActions, EditorBody, TabStrip } from "../editor/EditorGroup";
import * as docs from "../editor/documents";
import { api } from "../lib/ipc";
import type { Footprint } from "../lib/types";
import { FileTree, ExplorerHeader } from "../panels/Explorer";
import { activeTab, isSaver, setLayout, setState, useLayout, useSaver, useStore } from "../state/store";

const SearchPanel = lazy(() => import("../panels/SearchPanel"));
const GitPanel = lazy(() => import("../panels/GitPanel"));
const ClaudePanel = lazy(() => import("../claude/ClaudePanel"));
const TodoSide = lazy(() => import("../panels/BottomPanels").then((m) => ({ default: m.TodoPanel })));

export const Loading = () => (
  <div className="pad">
    <Spinner />
  </div>
);

/** Satu atau dua grup editor berdampingan. */
export function EditorGroups({ tabs = true, breadcrumb = true }: { tabs?: boolean; breadcrumb?: boolean }) {
  const count = useStore((s) => s.groups.length);
  const focused = useStore((s) => s.focusedGroup);
  const [split, setSplit] = useState(50);
  return (
    <div className="editor-groups" style={{ gridTemplateColumns: count > 1 ? `${split}% 4px minmax(0,1fr)` : "minmax(0,1fr)" }}>
      {Array.from({ length: count }, (_, g) => (
        <React.Fragment key={g}>
          {g === 1 && <Resizer axis="x" value={split} min={20} max={80} onChange={(v) => setSplit(v)} className="group-resizer" />}
          <div className={`editor-group ${count > 1 && focused === g ? "is-focused" : ""}`} onMouseDown={() => focused !== g && setState({ focusedGroup: g })}>
            {tabs && <TabStrip group={g} extra={<EditorActions group={g} />} />}
            <ErrorBoundary label="Editor mengalami error">
              <EditorBody group={g} breadcrumb={breadcrumb} />
            </ErrorBoundary>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function SideContent() {
  const layout = useLayout();
  return (
    <ErrorBoundary>
    <Suspense fallback={<Loading />}>
      {layout.sideView === "files" && (
        <>
          <ExplorerHeader />
          <FileTree />
        </>
      )}
      {layout.sideView === "search" && <SearchPanel />}
      {layout.sideView === "git" && <GitPanel />}
      {layout.sideView === "todo" && <TodoSide />}
    </Suspense>
    </ErrorBoundary>
  );
}

export function RightContent() {
  const layout = useLayout();
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>{layout.rightView === "claude" ? <ClaudePanel /> : <GitPanel />}</Suspense>
    </ErrorBoundary>
  );
}

/** Resizer untuk sidebar kiri / panel kanan / panel bawah yang menyimpan ukuran ke layout desain aktif. */
export function SideResizer({ side }: { side: "left" | "right" | "bottom" }) {
  const l = useLayout();
  if (side === "left") return <Resizer axis="x" value={l.sidebarW} min={170} max={520} onChange={(v) => setLayout({ sidebarW: v })} />;
  if (side === "right") return <Resizer axis="x" value={l.rightW} min={240} max={640} invert onChange={(v) => setLayout({ rightW: v })} />;
  return <Resizer axis="y" value={l.panelH} min={110} max={Math.round(window.innerHeight * 0.75)} invert onChange={(v) => setLayout({ panelH: v })} />;
}

function useFootprint() {
  const [fp, setFp] = useState<Footprint | null>(null);
  const saver = useSaver();
  useEffect(() => {
    let alive = true;
    const tick = () => api.footprint().then((f) => alive && setFp((p) => (p && Math.abs(p.core_mb - f.core_mb) < 0.5 && Math.abs(p.cpu_percent - f.cpu_percent) < 1 ? p : f))).catch(() => {});
    tick();
    const t = setInterval(tick, saver ? 30000 : 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [saver]);
  return fp;
}

export function DesignButton({ compact }: { compact?: boolean }) {
  const design = useStore((s) => s.settings.design);
  return (
    <button
      className="status-item"
      title="Ganti desain"
      onClick={(e) =>
        openMenu(
          e,
          DESIGNS.map((d) => ({ label: `${d.id === design ? "✓ " : ""}${d.name}`, run: () => A.setDesign(d.id) }))
        )
      }
    >
      <Palette size={12} aria-hidden />
      {!compact && designById(design).name}
    </button>
  );
}

export function StatusBar({ variant }: { variant: "aurora" | "zen" | "control" }) {
  const git = useStore((s) => s.git);
  const cursor = useStore((s) => s.cursor);
  const tab = useStore((s) => activeTab(s));
  const tabSize = useStore((s) => s.settings.tabSize);
  const counts = useStore((s) => {
    let e = 0;
    let w = 0;
    for (const l of Object.values(s.problems)) for (const p of l) p.severity === "error" ? e++ : w++;
    return `${e}:${w}`;
  });
  const [errors, warnings] = counts.split(":").map(Number);
  const saver = useSaver();
  const running = useStore((s) => s.terminals.filter((t) => t.kind !== "shell" && t.status === "running").length);
  const claude = useStore((s) => s.claude);
  const fp = useFootprint();
  const doc = tab?.kind === "text" ? docs.getDoc(tab.id) : null;
  const zen = variant === "zen";

  return (
    <footer className={`statusbar sb-${variant}`} role="contentinfo">
      <PinguStatus />
      {git?.is_repo && (
        <button className="status-item" onClick={() => (variant === "control" ? A.toggleRight("git") : A.toggleSidebar("git"))} title="Source control">
          <GitBranch size={12} aria-hidden /> {git.branch}
          {git.files.length > 0 && <span className="sb-dirty">•{git.files.length}</span>}
          {git.ahead > 0 && (
            <span className="sb-sync">
              <ArrowUp size={10} aria-hidden />
              {git.ahead}
            </span>
          )}
          {git.behind > 0 && (
            <span className="sb-sync">
              <ArrowDown size={10} aria-hidden />
              {git.behind}
            </span>
          )}
        </button>
      )}
      <button className={`status-item ${errors ? "tone-danger-fg" : ""}`} onClick={() => A.togglePanel("problems")} title="Masalah">
        <AlertCircle size={12} aria-hidden /> {errors}
        {!zen && (
          <>
            <AlertTriangle size={12} aria-hidden className={warnings ? "tone-warning-fg" : ""} /> {warnings}
          </>
        )}
      </button>
      {running > 0 && (
        <button className="status-item tone-run" onClick={() => A.togglePanel("terminal")} title="Proses berjalan">
          <Play size={11} aria-hidden /> {running} berjalan
        </button>
      )}
      <span className="spacer" />
      {saver && (
        <button className="status-item tone-success-fg" onClick={() => A.openSettings()} title="Mode hemat daya aktif">
          <Leaf size={12} aria-hidden /> {zen ? "" : "Hemat daya"}
        </button>
      )}
      {tab?.kind === "text" && (
        <>
          <span className="status-item">
            Ln {cursor.line}, Kol {cursor.col}
            {cursor.sel > 0 && ` (${cursor.sel} dipilih)`}
          </span>
          {!zen && <span className="status-item">Spasi: {tabSize}</span>}
          {!zen && doc && <span className="status-item">{doc.eol === "crlf" ? "CRLF" : "LF"}</span>}
          <span className="status-item sb-lang">{tab.lang}</span>
        </>
      )}
      {fp && (
        <span className="status-item sb-mem" title={`Proses inti Nozel: ${fp.core_mb} MB RAM, CPU ${fp.cpu_percent}%. Proses WebKit dihitung terpisah oleh macOS.${isSaver() ? " (hemat daya)" : ""}`}>
          <Cpu size={12} aria-hidden /> {Math.round(fp.core_mb)} MB{!zen && ` · ${fp.cpu_percent}%`}
        </span>
      )}
      {!zen && (
        <button className={`status-item sb-claude ${claude?.installed ? "" : "is-off"}`} onClick={() => A.toggleRight("claude")} title={claude?.version ?? claude?.error ?? "Claude Code"}>
          <Sparkles size={12} aria-hidden /> Claude
        </button>
      )}
      <DesignButton compact={zen} />
    </footer>
  );
}
