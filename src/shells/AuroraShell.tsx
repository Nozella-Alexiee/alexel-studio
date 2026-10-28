// Desain A — Aurora Glass: gelap macOS, sidebar kaca dengan kartu workspace,
// palette di title bar, agen Claude di kanan, dock terminal melayang.

import { Layers, Bug, Columns2, GitBranch, ListTree, PanelBottom, Play, Puzzle, Search, Settings } from "lucide-react";
import { Kepi } from "../components/CrabMascot";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { runActiveFile } from "../app/run";
import { NoziBrand, NoziPeek } from "../components/PenguinMascot";
import { MenuHamburger } from "../components/MenuBar";
import { IconButton, Kbd, Segmented } from "../components/ui";
import { BottomPanel } from "../panels/BottomPanel";
import { setLayout, useStore, type SideView } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar, openProjectMenu, useFitLayout } from "./common";
import { tl } from "../i18n";
import { useExtContainers, useHasExtViews } from "../exthost/views";
import { useActiveContainer } from "../panels/ExtContainerTabs";

export default function AuroraShell() {
  const l = useFitLayout(0);
  const hasViews = useHasExtViews();
  const containers = useExtContainers();
  const activeContainer = useActiveContainer(true);
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const split = useStore((s) => s.groups.length > 1);
  const name = root?.split("/").pop();

  return (
    <div className="shell shell-aurora">
      <header className="titlebar">
        <div className="traffic-space" />
        <MenuHamburger />
        <NoziBrand />
        <button className="palette-pill" onClick={() => openPalette("")}>
          <Search size={14} aria-hidden />
          <span>{name ? tl("Cari di {name}…", { name }) : tl("Cari berkas, perintah…")}</span>
          <Kbd keys="Mod+P" />
        </button>
        <div className="titlebar-actions">
          <IconButton label={tl("Jalankan berkas")} keys="Mod+R" tone="run" onClick={() => void runActiveFile()}>
            <Play size={15} />
          </IconButton>
          <IconButton label={tl("Belah editor")} keys="Mod+\" active={split} onClick={A.splitEditor}>
            <Columns2 size={15} />
          </IconButton>
          <IconButton label={tl("Panel bawah")} keys="Mod+J" active={l.panel} onClick={() => A.togglePanel()}>
            <PanelBottom size={15} />
          </IconButton>
          <IconButton label={tl("Pengaturan")} keys="Mod+," onClick={() => A.openSettings()}>
            <Settings size={15} />
          </IconButton>
          <IconButton label={tl("Panel agen AI")} keys="Mod+Alt+B" active={l.right} onClick={() => A.toggleRight("claude")}>
            <Kepi size={18} />
          </IconButton>
        </div>
      </header>

      <div className="shell-body" style={{ gridTemplateColumns: `${l.sidebar ? `${l.sidebarW}px 1px` : ""} minmax(0,1fr) ${l.right ? `1px ${l.rightW}px` : ""}` }}>
        {l.sidebar && (
          <>
            <aside className="sidebar" aria-label="Sidebar">
              <div className="workspace-card">
                <div className="ws-icon" aria-hidden>
                  {(name ?? "N")[0].toUpperCase()}
                </div>
                <div className="ws-text">
                  <button className="ws-name" onClick={openProjectMenu} title={tl("Ganti project")} aria-haspopup="menu">
                    {name ?? tl("Belum ada folder")}
                  </button>
                  {git?.is_repo && (
                    <div className="ws-sub">
                      <GitBranch size={11} aria-hidden /> {git.branch} · {git.files.length} perubahan
                    </div>
                  )}
                </div>
              </div>
              <Segmented<SideView>
                label={tl("Isi sidebar")}
                value={l.sideView}
                onChange={(v) => setLayout({ sideView: v })}
                options={[
                  { id: "files", label: "Files" },
                  { id: "git", label: "Git" },
                  { id: "search", label: tl("Cari") },
                  { id: "todo", label: "TODO" },
                  { id: "ext", label: <Puzzle size={13} />, title: tl("Ekstensi") },
                  { id: "run", label: <Bug size={13} />, title: "Run & Debug" },
                  { id: "outline", label: <ListTree size={13} />, title: tl("Outline (struktur berkas)") },
                ]}
              />
              <div className="side-scroll">
                <SideContent />
              </div>
              <NoziPeek />
            </aside>
            <SideResizer side="left" />
          </>
        )}

        <main className="main">
          <EditorGroups />
          {l.panel && (
            <>
              <SideResizer side="bottom" />
              <div className="dock" style={{ height: l.panelH }}>
                <BottomPanel />
              </div>
            </>
          )}
        </main>

        {l.right && (
          <>
            <SideResizer side="right" />
            <aside className="right-panel agent" aria-label={tl("Panel kanan")}>
              <div className="agent-tabs">
                <Segmented
                  label={tl("Panel kanan")}
                  value={l.rightView === "extviews" ? `ext:${activeContainer?.id ?? ""}` : l.rightView}
                  onChange={(v) => (v.startsWith("ext:") ? setLayout({ rightView: "extviews", extContainer: v.slice(4) }) : setLayout({ rightView: v as typeof l.rightView }))}
                  options={[
                    { id: "claude", label: <><Kepi size={14} /> {tl("Agen AI")}</> },
                    { id: "git", label: <><GitBranch size={12} /> Git</> },
                    ...(hasViews ? containers.map((c) => ({ id: `ext:${c.id}`, label: <><Layers size={12} /> {c.title}</> })) : []),
                  ]}
                />
              </div>
              <RightContent allExt />
            </aside>
          </>
        )}
      </div>
      <StatusBar variant="aurora" />
    </div>
  );
}
