// Desain Studio: tata letak seperti VS Code. Title bar dengan menu (Windows/Linux) dan command
// center, activity bar, sidebar, editor + panel bawah, sidebar sekunder untuk Claude, status bar.

import { FlaskConical, Layers, ListTodo, ListTree, Bug, Files, GitBranch, PanelBottom, PanelLeft, PanelRight, Puzzle, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { Kepi } from "../components/CrabMascot";
import { useDebug } from "../debug/state";
import { MenuBar, MenuHamburger } from "../components/MenuBar";
import { openMenu } from "../components/Overlays";
import { IconButton } from "../components/ui";
import { isMac } from "../lib/ipc";
import { prettyKeys } from "../lib/keys";
import { basename } from "../lib/paths";
import { BottomPanel } from "../panels/BottomPanel";
import { setLayout, useStore } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar, useFitLayout } from "./common";
import { tl } from "../i18n";
import { ContainerIcon, ExtContainerTabs, useSidebarContainers } from "../panels/ExtContainerTabs";
import { useExtContainers } from "../exthost/views";
import { useHasExtViews } from "../exthost/views";
import { useTests } from "../exthost/tests";

export default function StudioShell() {
  const l = useFitLayout(48);
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const debugging = useDebug((s) => s.status === "running" || s.status === "paused" || s.status === "starting");

  const hasViews = useHasExtViews();
  const sideContainers = useSidebarContainers();
  const hasRightViews = useExtContainers().some((c) => c.location !== "activitybar");
  const hasTests = useTests((s) => s.controllers.length > 0);
  const items: [string, ReactNode, string, () => void, boolean, number?][] = [
    ["files", <Files size={22} strokeWidth={1.6} />, `Explorer (${prettyKeys("Mod+Shift+E")})`, () => A.toggleSidebar("files"), l.sidebar && l.sideView === "files"],
    ["search", <Search size={22} strokeWidth={1.6} />, `Cari (${prettyKeys("Mod+Shift+F")})`, () => A.toggleSidebar("search"), l.sidebar && l.sideView === "search"],
    ["git", <GitBranch size={22} strokeWidth={1.6} />, `Source Control (${prettyKeys("Ctrl+Shift+G")})`, () => A.toggleSidebar("git"), l.sidebar && l.sideView === "git", git?.files.length || undefined],
    ["run", <Bug size={22} strokeWidth={1.6} />, `Run & Debug (${prettyKeys("Mod+Shift+D")})`, () => A.toggleSidebar("run"), l.sidebar && l.sideView === "run"],
    ["todo", <ListTodo size={22} strokeWidth={1.6} />, "TODO", () => A.toggleSidebar("todo"), l.sidebar && l.sideView === "todo"],
    ["outline", <ListTree size={22} strokeWidth={1.6} />, tl("Outline (struktur berkas)"), () => A.toggleSidebar("outline"), l.sidebar && l.sideView === "outline"],
    ["ext", <Puzzle size={22} strokeWidth={1.6} />, `Ekstensi (${prettyKeys("Mod+Shift+X")})`, () => A.toggleSidebar("ext"), l.sidebar && l.sideView === "ext"],
    ...(hasTests ? ([["tests", <FlaskConical size={22} strokeWidth={1.6} />, "Tests", () => A.toggleSidebar("tests"), l.sidebar && l.sideView === "tests"]] as typeof items) : []),
    ...sideContainers.map((c) => [`ext:${c.id}`, <ContainerIcon c={c} size={22} />, c.title, () => A.toggleSidebar(`ext:${c.id}`), l.sidebar && l.sideView === `ext:${c.id}`] as (typeof items)[number]),
    ...(hasRightViews ? ([["exviews", <Layers size={22} strokeWidth={1.6} />, tl("Tampilan ekstensi"), () => A.toggleRight("extviews"), l.right && l.rightView === "extviews"]] as typeof items) : []),
  ];

  return (
    <div className={`shell shell-studio ${debugging ? "is-debugging" : ""}`}>
      <header className="titlebar">
        <div className="traffic-space" />
        <MenuBar />
        <MenuHamburger className="mb-compact" />
        <div className="st-center">
          <button className="st-command" onClick={() => openPalette("")} title={tl("Cari berkas ({a}) · perintah ({b})", { a: prettyKeys("Mod+P"), b: prettyKeys("Mod+Shift+P") })}>
            <Search size={13} aria-hidden />
            <span>{root ? basename(root) : "Alexel Studio"}</span>
          </button>
        </div>
        <div className="titlebar-actions">
          <IconButton label="Sidebar" keys="Mod+B" active={l.sidebar} onClick={() => A.toggleSidebar()}>
            <PanelLeft size={15} />
          </IconButton>
          <IconButton label={tl("Panel bawah")} keys="Mod+J" active={l.panel} onClick={() => A.togglePanel()}>
            <PanelBottom size={15} />
          </IconButton>
          <IconButton label={tl("Agen AI (sidebar kanan)")} keys="Mod+Alt+B" active={l.right} onClick={() => A.toggleRight("claude")}>
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
          <button className={l.right && l.rightView === "claude" ? "is-on" : ""} onClick={() => A.toggleRight("claude")} title={`${tl("Agen AI")} (${prettyKeys(isMac ? "Mod+Escape" : "Ctrl+Alt+I")})`} aria-label={tl("Agen AI")} aria-pressed={l.right}>
            <Kepi size={22} />
          </button>
          <span className="spacer" />
          <button
            onClick={(e) =>
              openMenu(e, [
                { label: tl("Palette perintah"), keys: "Mod+Shift+P", run: () => openPalette(">") },
                { label: tl("Pengaturan"), keys: "Mod+,", run: () => A.openSettings() },
                { label: tl("Shortcut keyboard"), run: () => A.openSettings(undefined, "keys") },
                { label: tl("Ganti desain"), keys: "Ctrl+Mod+T", run: A.cycleDesign },
                { label: "", separator: true },
                { label: root ? tl("Ganti project…") : tl("Buka folder…"), run: () => void A.openProjectDialog() },
              ])
            }
            title={tl("Kelola")}
            aria-label={tl("Kelola")}
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
            <aside className="right-panel st-right" aria-label={tl("Sidebar kanan")}>
              {(hasViews || l.rightView !== "claude") && (
                <div className="ctl-right-tabs" role="tablist">
                  <button role="tab" aria-selected={l.rightView === "claude"} className={l.rightView === "claude" ? "is-on" : ""} onClick={() => setLayout({ rightView: "claude" })}>
                    CLAUDE
                  </button>
                  <ExtContainerTabs />
                  {l.rightView === "git" && (
                    <button role="tab" aria-selected={true} className="is-on" onClick={() => setLayout({ rightView: "git" })}>
                      GIT
                    </button>
                  )}
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
