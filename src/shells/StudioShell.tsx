// Desain Studio: tata letak seperti VS Code. Title bar dengan menu (Windows/Linux) dan command
// center, activity bar, sidebar, editor + panel bawah, sidebar sekunder untuk Claude, status bar.

import { Bug, Files, GitBranch, PanelBottom, PanelLeft, PanelRight, Puzzle, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { Kepi } from "../components/CrabMascot";
import { MenuBar } from "../components/MenuBar";
import { openMenu } from "../components/Overlays";
import { IconButton } from "../components/ui";
import { prettyKeys } from "../lib/keys";
import { basename } from "../lib/paths";
import { BottomPanel } from "../panels/BottomPanel";
import { setLayout, useLayout, useStore } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar } from "./common";

export default function StudioShell() {
  const l = useLayout();
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const debugging = false;

  const items: [string, ReactNode, string, () => void, boolean, number?][] = [
    ["files", <Files size={22} strokeWidth={1.6} />, `Explorer (${prettyKeys("Mod+Shift+E")})`, () => A.toggleSidebar("files"), l.sidebar && l.sideView === "files"],
    ["search", <Search size={22} strokeWidth={1.6} />, `Cari (${prettyKeys("Mod+Shift+F")})`, () => A.toggleSidebar("search"), l.sidebar && l.sideView === "search"],
    ["git", <GitBranch size={22} strokeWidth={1.6} />, `Source Control (${prettyKeys("Ctrl+Shift+G")})`, () => A.toggleSidebar("git"), l.sidebar && l.sideView === "git", git?.files.length || undefined],
    ["run", <Bug size={22} strokeWidth={1.6} />, `Run & Debug (${prettyKeys("Mod+Shift+D")})`, () => A.toggleSidebar("run"), l.sidebar && l.sideView === "run"],
    ["ext", <Puzzle size={22} strokeWidth={1.6} />, `Ekstensi (${prettyKeys("Mod+Shift+X")})`, () => A.toggleSidebar("ext"), l.sidebar && l.sideView === "ext"],
  ];

  return (
    <div className={`shell shell-studio ${debugging ? "is-debugging" : ""}`}>
      <header className="titlebar">
        <div className="traffic-space" />
        <MenuBar />
        <div className="st-center">
          <button className="st-command" onClick={() => openPalette("")} title={`Cari berkas (${prettyKeys("Mod+P")}) · perintah (${prettyKeys("Mod+Shift+P")})`}>
            <Search size={13} aria-hidden />
            <span>{root ? basename(root) : "Alexel Studio"}</span>
          </button>
        </div>
        <div className="titlebar-actions">
          <IconButton label="Sidebar" keys="Mod+B" active={l.sidebar} onClick={() => A.toggleSidebar()}>
            <PanelLeft size={15} />
          </IconButton>
          <IconButton label="Panel bawah" keys="Mod+J" active={l.panel} onClick={() => A.togglePanel()}>
            <PanelBottom size={15} />
          </IconButton>
          <IconButton label="Agen AI (sidebar kanan)" keys="Mod+Alt+B" active={l.right} onClick={() => A.toggleRight("claude")}>
            <PanelRight size={15} />
          </IconButton>
        </div>
      </header>

      <div className="shell-body" style={{ gridTemplateColumns: `48px ${l.sidebar ? `${l.sidebarW}px 1px` : ""} minmax(0,1fr) ${l.right ? `1px ${l.rightW}px` : ""}` }}>
        <nav className="activitybar" aria-label="Activity bar">
          {items.map(([id, icon, label, run, on, count]) => (
            <button key={id} className={on ? "is-on" : ""} onClick={run} title={label} aria-label={label} aria-pressed={on}>
              {icon}
              {count ? <span className="ab-count">{count > 99 ? "99+" : count}</span> : null}
            </button>
          ))}
          <button className={l.right && l.rightView === "claude" ? "is-on" : ""} onClick={() => A.toggleRight("claude")} title={`Agen AI (${prettyKeys("Mod+Escape")})`} aria-label="Agen AI" aria-pressed={l.right}>
            <Kepi size={22} />
          </button>
          <span className="spacer" />
          <button
            onClick={(e) =>
              openMenu(e, [
                { label: "Palette perintah", keys: "Mod+Shift+P", run: () => openPalette(">") },
                { label: "Pengaturan", keys: "Mod+,", run: () => A.openSettings() },
                { label: "Shortcut keyboard", run: () => A.openSettings(undefined, "keys") },
                { label: "Ganti desain", keys: "Ctrl+Mod+T", run: A.cycleDesign },
                { label: "", separator: true },
                { label: root ? "Ganti project…" : "Buka folder…", run: () => void A.openProjectDialog() },
              ])
            }
            title="Kelola"
            aria-label="Kelola"
            aria-haspopup="menu"
          >
            <Settings size={22} strokeWidth={1.6} />
          </button>
        </nav>

        {l.sidebar && (
          <>
            <aside className="sidebar" aria-label="Sidebar">
              <SideContent />
            </aside>
            <SideResizer side="left" />
          </>
        )}

        <main className="main st-main">
          <div className="st-editors">
            <EditorGroups />
          </div>
          {l.panel && (
            <>
              <SideResizer side="bottom" />
              <div className="st-panel" style={{ height: l.panelH }}>
                <BottomPanel upper />
              </div>
            </>
          )}
        </main>

        {l.right && (
          <>
            <SideResizer side="right" />
            <aside className="right-panel st-right" aria-label="Sidebar kanan">
              {l.rightView !== "claude" && (
                <div className="ctl-right-tabs" role="tablist">
                  <button role="tab" aria-selected={false} onClick={() => setLayout({ rightView: "claude" })}>
                    CLAUDE
                  </button>
                </div>
              )}
              <RightContent />
            </aside>
          </>
        )}
      </div>
      <StatusBar variant="studio" />
    </div>
  );
}
