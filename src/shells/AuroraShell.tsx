// Desain A — Aurora Glass: gelap macOS, sidebar kaca dengan kartu workspace,
// palette di title bar, agen Claude di kanan, dock terminal melayang.

import { Columns2, GitBranch, PanelBottom, PanelRight, Play, Search, Sparkles } from "lucide-react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { runActiveFile } from "../app/run";
import { IconButton, Kbd, Segmented } from "../components/ui";
import { BottomPanel } from "../panels/BottomPanel";
import { setLayout, useLayout, useStore, type SideView } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar } from "./common";

export default function AuroraShell() {
  const l = useLayout();
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const split = useStore((s) => s.groups.length > 1);
  const name = root?.split("/").pop();

  return (
    <div className="shell shell-aurora">
      <header className="titlebar" data-tauri-drag-region>
        <div className="traffic-space" data-tauri-drag-region />
        <button className="palette-pill" onClick={() => openPalette("")}>
          <Search size={14} aria-hidden />
          <span>{name ? `Cari di ${name}…` : "Cari berkas, perintah…"}</span>
          <Kbd keys="Mod+P" />
        </button>
        <div className="titlebar-actions">
          <IconButton label="Jalankan berkas" keys="Mod+R" tone="run" onClick={() => void runActiveFile()}>
            <Play size={15} />
          </IconButton>
          <IconButton label="Belah editor" keys="Mod+\" active={split} onClick={A.splitEditor}>
            <Columns2 size={15} />
          </IconButton>
          <IconButton label="Panel bawah" keys="Mod+J" active={l.panel} onClick={() => A.togglePanel()}>
            <PanelBottom size={15} />
          </IconButton>
          <IconButton label="Panel Claude" keys="Mod+Alt+B" active={l.right} onClick={() => A.toggleRight("claude")}>
            <PanelRight size={15} />
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
                  <button className="ws-name" onClick={() => void A.openProjectDialog()} title="Buka folder lain">
                    {name ?? "Belum ada folder"}
                  </button>
                  {git?.is_repo && (
                    <div className="ws-sub">
                      <GitBranch size={11} aria-hidden /> {git.branch} · {git.files.length} perubahan
                    </div>
                  )}
                </div>
              </div>
              <Segmented<SideView>
                label="Isi sidebar"
                value={l.sideView}
                onChange={(v) => setLayout({ sideView: v })}
                options={[
                  { id: "files", label: "Files" },
                  { id: "git", label: "Git" },
                  { id: "search", label: "Cari" },
                  { id: "todo", label: "TODO" },
                ]}
              />
              <div className="side-scroll">
                <SideContent />
              </div>
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
            <aside className="right-panel agent" aria-label="Panel kanan">
              <div className="agent-tabs">
                <Segmented
                  label="Panel kanan"
                  value={l.rightView}
                  onChange={(v) => setLayout({ rightView: v })}
                  options={[
                    { id: "claude", label: <><Sparkles size={12} /> Claude</> },
                    { id: "git", label: <><GitBranch size={12} /> Git</> },
                  ]}
                />
              </div>
              <RightContent />
            </aside>
          </>
        )}
      </div>
      <StatusBar variant="aurora" />
    </div>
  );
}
