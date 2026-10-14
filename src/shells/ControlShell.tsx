// Desain C — Control Room: padat ala IDE. Toolbar run dengan pilihan target Smart Run,
// rail ikon, sidebar, split editor, panel bawah ter-dock, panel Git/Claude di kanan.

import { ChevronDown, Columns2, Files, GitBranch, ListTodo, Play, Search, Settings, Sparkles, Square, Network, TerminalSquare } from "lucide-react";
import { useState, type ReactNode } from "react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { runActiveFile, runTarget } from "../app/run";
import { openMenu } from "../components/Overlays";
import { IconButton } from "../components/ui";
import { BottomPanel } from "../panels/BottomPanel";
import { getState, setLayout, useLayout, useStore } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar } from "./common";

function RunConfig() {
  const targets = useStore((s) => s.runTargets);
  const [sel, setSel] = useState<string>("file");
  const runningCount = useStore((s) => s.terminals.filter((t) => t.kind === "run" && t.status === "running").length);
  const current = targets.find((t) => t.id === sel);
  const label = current ? current.label : "Berkas aktif";
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
            { label: `${sel === "file" ? "✓ " : ""}Berkas aktif`, run: () => setSel("file") },
            ...(targets.length ? [{ separator: true, label: "" }] : []),
            ...targets.map((t) => ({ label: `${sel === t.id ? "✓ " : ""}${t.label}`, keys: t.kind, run: () => setSel(t.id) })),
          ])
        }
        aria-label="Pilih target run"
      >
        <TerminalSquare size={13} aria-hidden />
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      <IconButton label={`Jalankan ${label}`} keys={current ? undefined : "Mod+R"} tone="run" onClick={run}>
        <Play size={14} />
      </IconButton>
      <IconButton label="Hentikan semua run" tone="danger" onClick={() => void stop()} disabled={!runningCount}>
        <Square size={12} />
      </IconButton>
    </div>
  );
}

export default function ControlShell() {
  const l = useLayout();
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const split = useStore((s) => s.groups.length > 1);
  const problems = useStore((s) => Object.values(s.problems).reduce((a, x) => a + x.filter((p) => p.severity === "error").length, 0));

  const rail: [string, ReactNode, string, () => void, boolean, number?][] = [
    ["files", <Files size={19} />, "Explorer (⌘⇧E)", () => A.toggleSidebar("files"), l.sidebar && l.sideView === "files"],
    ["search", <Search size={19} />, "Cari (⌘⇧F)", () => A.toggleSidebar("search"), l.sidebar && l.sideView === "search"],
    ["git", <GitBranch size={19} />, "Source control (⌃⇧G)", () => A.toggleRight("git"), l.right && l.rightView === "git", git?.files.length || undefined],
    ["todo", <ListTodo size={19} />, "TODO", () => A.toggleSidebar("todo"), l.sidebar && l.sideView === "todo"],
    ["ports", <Network size={19} />, "Port & proses", () => A.togglePanel("ports"), l.panel && l.panelTab === "ports"],
    ["claude", <Sparkles size={19} />, "Claude (⌘⌥B)", () => A.toggleRight("claude"), l.right && l.rightView === "claude"],
  ];

  return (
    <div className="shell shell-control">
      <header className="titlebar" data-tauri-drag-region>
        <div className="traffic-space" data-tauri-drag-region />
        <RunConfig />
        <div className="ctl-center" data-tauri-drag-region>
          <button className="ctl-project" onClick={() => openPalette("")} title="Cari berkas (⌘P)">
            <Search size={12} aria-hidden /> {root ? root.split("/").pop() : "Nozel Code"}
            {git?.is_repo && <span className="ctl-branch">· {git.branch}</span>}
          </button>
        </div>
        <div className="titlebar-actions">
          {problems > 0 && (
            <button className="ctl-problems" onClick={() => A.togglePanel("problems")}>
              {problems} error
            </button>
          )}
          <IconButton label="Belah editor" keys="Mod+\" active={split} onClick={A.splitEditor}>
            <Columns2 size={15} />
          </IconButton>
          <IconButton label="Pengaturan" keys="Mod+," onClick={() => A.openSettings()}>
            <Settings size={15} />
          </IconButton>
        </div>
      </header>

      <div className="shell-body" style={{ gridTemplateColumns: `46px ${l.sidebar ? `${l.sidebarW}px 1px` : ""} minmax(0,1fr) ${l.right ? `1px ${l.rightW}px` : ""}` }}>
        <nav className="rail tile" aria-label="Navigasi">
          {rail.map(([id, icon, label, run, on, count]) => (
            <button key={id} className={on ? "is-on" : ""} onClick={run} title={label} aria-label={label} aria-pressed={on}>
              {icon}
              {count ? <span className="rail-count">{count}</span> : null}
            </button>
          ))}
          <span className="spacer" />
          <button onClick={() => A.togglePanel("terminal")} title="Terminal (⌃`)" aria-label="Terminal" className={l.panel && l.panelTab === "terminal" ? "is-on" : ""}>
            <TerminalSquare size={19} />
          </button>
          <button onClick={() => A.openSettings()} title="Pengaturan (⌘,)" aria-label="Pengaturan">
            <Settings size={19} />
          </button>
        </nav>

        {l.sidebar && (
          <>
            <aside className="sidebar tile" aria-label="Sidebar">
              <SideContent />
            </aside>
            <SideResizer side="left" />
          </>
        )}

        <main className="main ctl-mid">
          <div className="tile ctl-editors">
            <EditorGroups />
          </div>
          {l.panel && (
            <>
              <SideResizer side="bottom" />
              <div className="tile ctl-panel" style={{ height: l.panelH }}>
                <BottomPanel upper />
              </div>
            </>
          )}
        </main>

        {l.right && (
          <>
            <SideResizer side="right" />
            <aside className="right-panel tile" aria-label="Panel kanan">
              <div className="ctl-right-tabs" role="tablist">
                <button role="tab" aria-selected={l.rightView === "git"} className={l.rightView === "git" ? "is-on" : ""} onClick={() => setLayout({ rightView: "git" })}>
                  GIT
                </button>
                <button role="tab" aria-selected={l.rightView === "claude"} className={l.rightView === "claude" ? "is-on" : ""} onClick={() => setLayout({ rightView: "claude" })}>
                  CLAUDE
                </button>
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

