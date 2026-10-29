// Desain C — Control Room: padat ala IDE. Toolbar run dengan pilihan target Smart Run,
// rail ikon, sidebar, split editor, panel bawah ter-dock, panel Git/Claude di kanan.

import { Bug, ChevronDown, Database, Columns2, Files, FlaskConical, Layers, FolderOpen, GitBranch, ListTodo, Play, Puzzle, Search, Settings, Square, Network, TerminalSquare } from "lucide-react";
import { Kepi } from "../components/CrabMascot";
import { useState, type ReactNode } from "react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { runActiveFile, runTarget } from "../app/run";
import { openMenu } from "../components/Overlays";
import { NoziBrand } from "../components/PenguinMascot";
import { MenuHamburger } from "../components/MenuBar";
import { IconButton } from "../components/ui";
import { BottomPanel } from "../panels/BottomPanel";
import { getState, setLayout, useStore } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar, openProjectMenu, useFitLayout } from "./common";
import { prettyKeys } from "../lib/keys";
import { tl } from "../i18n";
import { ContainerIcon, ExtContainerTabs, useSidebarContainers } from "../panels/ExtContainerTabs";
import { useExtContainers } from "../exthost/views";
import { useTests } from "../exthost/tests";

function RunConfig() {
  const targets = useStore((s) => s.runTargets);
  const [sel, setSel] = useState<string>("file");
  const runningCount = useStore((s) => s.terminals.filter((t) => t.kind === "run" && t.status === "running").length);
  const current = targets.find((t) => t.id === sel);
  const label = current ? current.label : tl("Berkas aktif");
  const run = () => (current ? void runTarget(current) : void runActiveFile());
  const stop = async () => {
    const T = await import("../terminal/terminals");
    for (const t of getState().terminals) if (t.kind === "run" && t.status === "running") await T.stopTerminal(t.key);
  };
  return (
    <div className="run-config">
      <button
        className="run-select"
        onClick={(e) =>
          openMenu(e, [
            { label: `${sel === "file" ? "✓ " : ""}${tl("Berkas aktif")}`, run: () => setSel("file") },
            ...(targets.length ? [{ separator: true, label: "" }] : []),
            ...targets.map((t) => ({ label: `${sel === t.id ? "✓ " : ""}${t.label}`, keys: t.kind, run: () => setSel(t.id) })),
          ])
        }
        aria-label={tl("Pilih target run")}
      >
        <TerminalSquare size={13} aria-hidden />
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      <IconButton label={tl("Jalankan {name}", { name: label })} keys={current ? undefined : "Mod+R"} tone="run" onClick={run}>
        <Play size={14} />
      </IconButton>
      <IconButton label={tl("Hentikan semua run")} tone="danger" onClick={() => void stop()} disabled={!runningCount}>
        <Square size={12} />
      </IconButton>
    </div>
  );
}

export default function ControlShell() {
  const l = useFitLayout(46);
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const split = useStore((s) => s.groups.length > 1);
  const problems = useStore((s) => Object.values(s.problems).reduce((a, x) => a + x.filter((p) => p.severity === "error").length, 0));

  const sideContainers = useSidebarContainers();
  const hasRightViews = useExtContainers().some((c) => c.location !== "activitybar");
  const hasTests = useTests((s) => s.controllers.length > 0);
  const rail: [string, ReactNode, string, () => void, boolean, number?][] = [
    ["files", <Files size={19} />, `Explorer (${prettyKeys("Mod+Shift+E")})`, () => A.toggleSidebar("files"), l.sidebar && l.sideView === "files"],
    ["search", <Search size={19} />, `Cari (${prettyKeys("Mod+Shift+F")})`, () => A.toggleSidebar("search"), l.sidebar && l.sideView === "search"],
    ["git", <GitBranch size={19} />, `Source control (${prettyKeys("Ctrl+Shift+G")})`, () => A.toggleRight("git"), l.right && l.rightView === "git", git?.files.length || undefined],
    ["run", <Bug size={19} />, `Run & Debug (${prettyKeys("Mod+Shift+D")})`, () => A.toggleSidebar("run"), l.sidebar && l.sideView === "run"],
    ["todo", <ListTodo size={19} />, "TODO", () => A.toggleSidebar("todo"), l.sidebar && l.sideView === "todo"],
    ["db", <Database size={19} />, tl("Database"), () => A.toggleSidebar("db"), l.sidebar && l.sideView === "db"],
    ["ext", <Puzzle size={19} />, "Ekstensi", () => A.toggleSidebar("ext"), l.sidebar && l.sideView === "ext"],
    ...(hasTests ? ([["tests", <FlaskConical size={19} />, "Tests", () => A.toggleSidebar("tests"), l.sidebar && l.sideView === "tests"]] as typeof rail) : []),
    ...sideContainers.map((c) => [`ext:${c.id}`, <ContainerIcon c={c} size={19} />, c.title, () => A.toggleSidebar(`ext:${c.id}`), l.sidebar && l.sideView === `ext:${c.id}`] as (typeof rail)[number]),
    ...(hasRightViews ? ([["exviews", <Layers size={19} />, tl("Tampilan ekstensi"), () => A.toggleRight("extviews"), l.right && l.rightView === "extviews"]] as typeof rail) : []),
    ["ports", <Network size={19} />, "Port & proses", () => A.togglePanel("ports"), l.panel && l.panelTab === "ports"],
    ["claude", <Kepi size={21} />, `${tl("Agen AI")} (${prettyKeys("Mod+Alt+B")})`, () => A.toggleRight("claude"), l.right && l.rightView === "claude"],
  ];

  return (
    <div className="shell shell-control">
      <header className="titlebar">
        <div className="traffic-space" />
        <MenuHamburger />
        <NoziBrand />
        <RunConfig />
        <div className="ctl-center">
          <button className="ctl-project" onClick={openProjectMenu} title={tl("Ganti project")} aria-haspopup="menu">
            <FolderOpen size={12} aria-hidden /> {root ? root.split("/").pop() : tl("Buka project")}
            {git?.is_repo && <span className="ctl-branch">· {git.branch}</span>}
          </button>
          <button className="ctl-search" onClick={() => openPalette("")} title={`${tl("Cari berkas")} (${prettyKeys("Mod+P")})`} aria-label={tl("Cari berkas")}>
            <Search size={12} aria-hidden /> <span>{tl("Cari berkas")}</span> <kbd>{prettyKeys("Mod+P")}</kbd>
          </button>
        </div>
        <div className="titlebar-actions">
          {problems > 0 && (
            <button className="ctl-problems" onClick={() => A.togglePanel("problems")}>
              {problems} error
            </button>
          )}
          <IconButton label={tl("Belah editor")} keys="Mod+\" active={split} onClick={A.splitEditor}>
            <Columns2 size={15} />
          </IconButton>
          <IconButton label={tl("Pengaturan")} keys="Mod+," onClick={() => A.openSettings()}>
            <Settings size={15} />
          </IconButton>
        </div>
      </header>

      <div className="shell-body" style={{ gridTemplateColumns: `46px ${l.sidebar ? `${l.sidebarW}px 1px` : ""} minmax(0,1fr) ${l.right ? `1px ${l.rightW}px` : ""}` }}>
        <nav className="rail ctl-tile" aria-label={tl("Navigasi")}>
          {rail.map(([id, icon, label, run, on, count]) => (
            <button key={id} className={on ? "is-on" : ""} onClick={run} title={label} aria-label={label} aria-pressed={on}>
              {icon}
              {count ? <span className="rail-count">{count}</span> : null}
            </button>
          ))}
          <span className="spacer" />
          <button onClick={() => A.togglePanel("terminal")} title={`Terminal (${prettyKeys("Ctrl+`")})`} aria-label="Terminal" className={l.panel && l.panelTab === "terminal" ? "is-on" : ""}>
            <TerminalSquare size={19} />
          </button>
          <button onClick={() => A.openSettings()} title={`${tl("Pengaturan")} (${prettyKeys("Mod+,")})`} aria-label={tl("Pengaturan")}>
            <Settings size={19} />
          </button>
        </nav>

        {l.sidebar && (
          <>
            <aside className="sidebar ctl-tile" aria-label="Sidebar">
              <SideContent />
            </aside>
            <SideResizer side="left" />
          </>
        )}

        <main className="main ctl-mid">
          <div className="ctl-tile ctl-editors">
            <EditorGroups />
          </div>
          {l.panel && (
            <>
              <SideResizer side="bottom" />
              <div className="ctl-tile ctl-panel" style={{ height: l.panelH }}>
                <BottomPanel upper />
              </div>
            </>
          )}
        </main>

        {l.right && (
          <>
            <SideResizer side="right" />
            <aside className="right-panel ctl-tile" aria-label={tl("Panel kanan")}>
              <div className="ctl-right-tabs" role="tablist">
                <button role="tab" aria-selected={l.rightView === "git"} className={l.rightView === "git" ? "is-on" : ""} onClick={() => setLayout({ rightView: "git" })}>
                  GIT
                </button>
                <button role="tab" aria-selected={l.rightView === "claude"} className={l.rightView === "claude" ? "is-on" : ""} onClick={() => setLayout({ rightView: "claude" })}>
                  CLAUDE
                </button>
                <ExtContainerTabs />
              </div>
              <RightContent />
            </aside>
          </>
        )}
      </div>
      <StatusBar variant="control" />
    </div>
  );
}

