import { AlertCircle, AlertTriangle, Cpu, GitBranch, Leaf, Palette, ArrowUp, ArrowDown, Play } from "lucide-react";
import { Kepi } from "../components/CrabMascot";
import { DebugToolbar } from "../components/DebugToolbar";
import { agentInfo } from "../agents/registry";
import React, { Suspense, lazy, useEffect, useState } from "react";
import * as A from "../app/actions";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { NoziStatus } from "../components/PenguinMascot";
import { openMenu } from "../components/Overlays";
import { Resizer, Spinner } from "../components/ui";
import { DESIGNS, designById } from "../design/designs";
import { EditorActions, EditorBody, TabStrip } from "../editor/EditorGroup";
import * as docs from "../editor/documents";
import { api } from "../lib/ipc";
import type { Footprint } from "../lib/types";
import { FileTree, ExplorerHeader } from "../panels/Explorer";
import { activeTab, isSaver, setLayout, setState, useLayout, useSaver, useStore } from "../state/store";
import { tl } from "../i18n";
import { ExtStatusItems } from "../exthost/StatusItems";

const SearchPanel = lazy(() => import("../panels/SearchPanel"));
const GitPanel = lazy(() => import("../panels/GitPanel"));
const ClaudePanel = lazy(() => import("../claude/ClaudePanel"));
const ExtensionsPanel = lazy(() => import("../panels/ExtensionsPanel"));
const OutlinePanel = lazy(() => import("../panels/OutlinePanel"));
const RunView = lazy(() => import("../panels/RunView"));
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
      <DebugToolbar />
      {Array.from({ length: count }, (_, g) => (
        <React.Fragment key={g}>
          {g === 1 && <Resizer axis="x" value={split} min={20} max={80} onChange={(v) => setSplit(v)} className="group-resizer" />}
          <div className={`editor-group ${count > 1 && focused === g ? "is-focused" : ""}`} onMouseDown={() => focused !== g && setState({ focusedGroup: g })}>
            {tabs && <TabStrip group={g} extra={<EditorActions group={g} />} />}
            <ErrorBoundary label={tl("Editor mengalami error")}>
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
      {layout.sideView === "ext" && <ExtensionsPanel />}
      {layout.sideView === "outline" && <OutlinePanel />}
      {layout.sideView === "run" && <RunView />}
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

/** Lebar jendela, diperbarui saat di-resize. */
function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/** Editor minimal selebar ini; sisanya dibagi ke sidebar & panel kanan. */
const MIN_EDITOR = 420;

/**
 * Lebar sidebar/panel kanan yang benar-benar dipakai: ukuran tersimpan dikecilkan seperlunya agar
 * editor tetap terlihat di jendela sempit, dan panel kanan disembunyikan bila tetap tidak muat.
 */
export function useFitLayout(rail: number) {
  const l = useLayout();
  const w = useWindowWidth();
  let side = l.sidebar ? l.sidebarW : 0;
  let right = l.right ? l.rightW : 0;
  let showRight = l.right;
  const room = w - rail - MIN_EDITOR;
  if (side + right > room) {
    right = Math.max(240, room - side);
    if (side + right > room) side = Math.max(170, room - right);
    if (side + right > room) {
      showRight = false;
      right = 0;
      side = Math.min(side, Math.max(170, room));
    }
  }
  return { ...l, right: showRight, sidebarW: l.sidebar ? side : l.sidebarW, rightW: showRight ? right : l.rightW };
}

/** Resizer untuk sidebar kiri / panel kanan / panel bawah yang menyimpan ukuran ke layout desain aktif. */
export function SideResizer({ side }: { side: "left" | "right" | "bottom" }) {
  const l = useLayout();
  if (side === "left") return <Resizer axis="x" value={l.sidebarW} min={170} max={520} onChange={(v) => setLayout({ sidebarW: v })} />;
  if (side === "right") return <Resizer axis="x" value={l.rightW} min={240} max={640} invert onChange={(v) => setLayout({ rightW: v })} />;
  return <Resizer axis="y" value={l.panelH} min={110} max={Math.round(window.innerHeight * 0.75)} invert onChange={(v) => setLayout({ panelH: v })} />;
}

function useFootprint(enabled: boolean) {
  const [fp, setFp] = useState<Footprint | null>(null);
  const saver = useSaver();
  useEffect(() => {
    if (!enabled) {
      setFp(null);
      return;
    }
    let alive = true;
    const tick = () => api.footprint().then((f) => alive && setFp((p) => (p && Math.abs(p.core_mb - f.core_mb) < 0.5 && Math.abs(p.cpu_percent - f.cpu_percent) < 1 ? p : f))).catch(() => {});
    tick();
    const t = setInterval(tick, saver ? 30000 : 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [saver, enabled]);
  return fp;
}

/** Menu ganti project: project terakhir, buka folder lain, tutup folder (kembali ke Welcome). */
export function openProjectMenu(e: React.MouseEvent) {
  const { root, recents } = useStore.getState();
  const others = recents.filter((r) => r !== root).slice(0, 8);
  openMenu(e, [
    ...others.map((r) => ({ label: r.split("/").pop() ?? r, keys: r.replace(/^\/Users\/[^/]+/, "~").split("/").slice(0, -1).join("/"), run: () => void A.openProject(r) })),
    ...(others.length ? [{ label: "", separator: true }] : []),
    { label: tl("Buka folder…"), keys: "Mod+O", run: () => void A.openProjectDialog() },
    ...(root ? [{ label: tl("Tutup folder"), run: () => void A.closeProject() }] : []),
  ]);
}

export function DesignButton({ compact }: { compact?: boolean }) {
  const design = useStore((s) => s.settings.design);
  return (
    <button
      className="status-item"
      title={tl("Ganti desain")}
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

const LANG_CHOICES: [string, string | null][] = [
  ["Otomatis (dari nama berkas)", null],
  ["Teks biasa", "txt"],
  ["JavaScript", "js"],
  ["TypeScript", "ts"],
  ["TypeScript (TSX)", "tsx"],
  ["JSON", "json"],
  ["HTML", "html"],
  ["CSS", "css"],
  ["SCSS", "scss"],
  ["Markdown", "md"],
  ["Python", "py"],
  ["Rust", "rs"],
  ["Go", "go"],
  ["PHP", "php"],
  ["Java", "java"],
  ["C", "c"],
  ["C++", "cpp"],
  ["SQL", "sql"],
  ["YAML", "yaml"],
  ["XML", "xml"],
  ["Shell", "sh"],
  ["Vue", "vue"],
];

export function StatusBar({ variant }: { variant: "aurora" | "zen" | "control" | "studio" }) {
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
  const agent = useStore((s) => s.settings.agent);
  const showRes = useStore((s) => s.settings.showResources);
  const fp = useFootprint(showRes);
  const doc = tab?.kind === "text" ? docs.getDoc(tab.id) : null;
  const zen = variant === "zen";

  return (
    <footer className={`statusbar sb-${variant}`} role="contentinfo">
      <NoziStatus />
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
      <button className={`status-item ${errors ? "tone-danger-fg" : ""}`} onClick={() => A.togglePanel("problems")} title={tl("Masalah")}>
        <AlertCircle size={12} aria-hidden /> {errors}
        {!zen && (
          <>
            <AlertTriangle size={12} aria-hidden className={warnings ? "tone-warning-fg" : ""} /> {warnings}
          </>
        )}
      </button>
      {running > 0 && (
        <button className="status-item tone-run" onClick={() => A.togglePanel("terminal")} title={tl("Proses berjalan")}>
          <Play size={11} aria-hidden /> {running} berjalan
        </button>
      )}
      <ExtStatusItems side="left" />
      <span className="spacer" />
      <ExtStatusItems side="right" />
      {saver && (
        <button className="status-item tone-success-fg" onClick={() => A.openSettings()} title={tl("Mode hemat daya aktif")}>
          <Leaf size={12} aria-hidden /> {zen ? "" : tl("Hemat daya")}
        </button>
      )}
      {tab?.kind === "text" && (
        <>
          <span className="status-item">
            {tl("Ln {line}, Kol {col}", { line: cursor.line, col: cursor.col })}
            {cursor.sel > 0 && ` ${tl("({n} dipilih)", { n: cursor.sel })}`}
          </span>
          {!zen && (
            <button
              className="status-item"
              title={tl("Ukuran indentasi")}
              onClick={(e) => openMenu(e, [2, 4, 8].map((n) => ({ label: `${n === tabSize ? "✓ " : ""}${tl("Spasi: {n}", { n })}`, run: () => A.updateSettings({ tabSize: n }) })))}
            >
              {tl("Spasi: {n}", { n: tabSize })}
            </button>
          )}
          {!zen && <span className="status-item" title={tl("Encoding berkas")}>UTF-8</span>}
          {doc && (!zen || doc.eol === "crlf") && (
            <button
              className="status-item"
              title={tl("Akhir baris")}
              onClick={(e) =>
                openMenu(e, [
                  { label: `${doc.eol === "lf" ? "✓ " : ""}LF (macOS, Linux)`, run: () => docs.setDocEol(tab.id, "lf") },
                  { label: `${doc.eol === "crlf" ? "✓ " : ""}CRLF (Windows)`, run: () => docs.setDocEol(tab.id, "crlf") },
                ])
              }
            >
              {doc.eol === "crlf" ? "CRLF" : "LF"}
            </button>
          )}
          <button
            className="status-item sb-lang"
            title={`${tl("Bahasa: {lang}", { lang: tab.lang })}${doc?.lspName ? ` · ${tl("server bahasa {name}", { name: doc.lspName })}` : ""}. ${tl("Klik untuk mengganti.")}`}
            onClick={(e) => openMenu(e, LANG_CHOICES.map(([label, ext]) => ({ label: tl(label), run: () => docs.setDocLanguage(tab.id, ext) })))}
          >
            {tab.lang}
            {doc?.lspName && <span className="sb-lsp" aria-label={tl("Server bahasa aktif")} />}
          </button>
        </>
      )}
      {showRes && fp && (
        <span className="status-item sb-mem" title={`RAM total Alexel Studio ${fp.core_mb} MB${fp.processes ? ` di ${fp.processes} proses` : ""}, CPU ${fp.cpu_percent}%.${isSaver() ? " (hemat daya)" : ""}`}>
          <Cpu size={12} aria-hidden /> {Math.round(fp.core_mb)} MB{!zen && ` · ${fp.cpu_percent}%`}
        </span>
      )}
      {!zen && (
        <button className={`status-item sb-claude ${agent !== "claude" || claude?.installed ? "" : "is-off"}`} onClick={() => A.toggleRight("claude")} title={`${tl("Agen AI")}: ${agentInfo(agent).name}`}>
          <Kepi size={14} /> {agentInfo(agent).short}
        </button>
      )}
      {variant !== "studio" && <DesignButton compact={zen} />}
    </footer>
  );
}
