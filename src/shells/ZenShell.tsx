// Desain B — Zen Paper: terang hangat, tanpa activity bar & tab bar. Navigator di kiri
// (berkas terbuka, ringkasan simbol, tree), satu kolom fokus, omnibar di bawah.

import { Bug, ChevronDown, ChevronRight, Columns2, Files, Layers, GitBranch, Play, Puzzle, Search, Settings, TerminalSquare, X, Focus, ListTodo } from "lucide-react";
import { Kepi } from "../components/CrabMascot";
import { useState, type ReactNode } from "react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { runActiveFile } from "../app/run";
import { FileIcon } from "../components/FileIcon";
import { NoziBrand, NoziProcesses, usePenguinVariant } from "../components/PenguinMascot";
import { MenuHamburger } from "../components/MenuBar";
import { PreviewToggle } from "../editor/EditorGroup";
import { IconButton, Kbd } from "../components/ui";
import { relative } from "../lib/paths";
import { PanelContent, PanelTabs } from "../panels/BottomPanel";
import { Outline } from "../panels/OutlinePanel";
import { FileTree } from "../panels/Explorer";
import { activeTab, setLayout, useStore } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar, openProjectMenu, useFitLayout } from "./common";
import { prettyKeys } from "../lib/keys";
import { tl } from "../i18n";
import { useHasExtViews } from "../exthost/views";

function Section({ title, children, defaultOpen = true, action }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="zen-sec">
      <div className="zen-sec-head">
        <button className="zen-sec-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {title}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

function OpenFiles() {
  const groups = useStore((s) => s.groups);
  const tabs = useStore((s) => s.tabs);
  const focused = useStore((s) => s.focusedGroup);
  const ids = [...new Set(groups.flatMap((g) => g.tabs))];
  const active = groups[focused]?.active;
  if (!ids.length) return <div className="hint pad-x">{tl("Belum ada. Tekan {keys}.", { keys: prettyKeys("Mod+P") })}</div>;
  return (
    <ul className="zen-open">
      {ids.map((id) => {
        const t = tabs[id];
        if (!t) return null;
        return (
          <li key={id}>
            <div className={`zen-item ${id === active ? "is-on" : ""} ${t.dirty ? "is-dirty" : ""}`} role="button" tabIndex={0} onClick={() => A.activateTab(id, groups.findIndex((g) => g.tabs.includes(id)))} onKeyDown={(e) => e.key === "Enter" && A.activateTab(id)}>
              <FileIcon filename={t.name} size={14} />
              <span className="zen-name">{t.name}</span>
              <button className="zen-x" aria-label={tl("Tutup {name}", { name: t.name })} onClick={(e) => { e.stopPropagation(); void A.closeTab(id, groups.findIndex((g) => g.tabs.includes(id))); }}>
                {t.dirty ? <span className="tab-dot" /> : <X size={12} />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function ZenShell() {
  const l = useFitLayout(0);
  const hasViews = useHasExtViews();
  const tab = useStore((s) => activeTab(s));
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const split = useStore((s) => s.groups.length > 1);
  const penguin = usePenguinVariant();
  const rel = tab?.kind === "text" || tab?.kind === "image" ? relative(root ?? "", tab.id) : tab?.name;

  return (
    <div className="shell shell-zen">
      <header className="titlebar">
        <div className="traffic-space" />
        <MenuHamburger />
        <NoziBrand />
        <div className="zen-crumb">
          <button className="zen-root" onClick={openProjectMenu} title={tl("Ganti project")} aria-haspopup="menu">
            {root ? root.split("/").pop() : tl("Buka project")}
          </button>
          {rel && (
            <>
              <span className="zen-slash">/</span>
              <b>{rel}</b>
              {tab?.dirty && <span className="zen-live" aria-label={tl("belum disimpan")}>●</span>}
            </>
          )}
        </div>
        <div className="titlebar-actions">
          {/* Zen menyembunyikan tab strip, jadi pratinjau Markdown/HTML dan belah editor dipasang di sini. */}
          {tab && <PreviewToggle tab={tab} />}
          <IconButton label={tl("Belah editor")} keys="Mod+\" active={split} onClick={A.splitEditor}>
            <Columns2 size={15} />
          </IconButton>
          <button className="tbtn tone-run" onClick={() => void runActiveFile()} title={`${tl("Jalankan")} (${prettyKeys("Mod+R")})`}>
            <Play size={14} /> <span>{tl("Jalankan")}</span>
          </button>
          <button className={`tbtn ${l.panel ? "is-on" : ""}`} onClick={() => A.togglePanel("terminal")} title={`Terminal (${prettyKeys("Ctrl+`")})`}>
            <TerminalSquare size={14} /> <span>Terminal</span>
          </button>
          <button className={`tbtn ${l.right ? "is-on" : ""}`} onClick={() => A.toggleRight("claude")} title={`${tl("Agen AI")} (${prettyKeys("Mod+Alt+B")})`}>
            <Kepi size={16} /> <span>{tl("Agen AI")}</span>
          </button>
          <IconButton label={tl("Pengaturan")} keys="Mod+," onClick={() => A.openSettings()}>
            <Settings size={15} />
          </IconButton>
          <IconButton label={tl("Mode fokus")} active={!l.sidebar && !l.right} onClick={() => setLayout(!l.sidebar && !l.right ? { sidebar: true } : { sidebar: false, right: false, panel: false })}>
            <Focus size={15} />
          </IconButton>
        </div>
      </header>

      <div className="shell-body" style={{ gridTemplateColumns: `${l.sidebar ? `${l.sidebarW}px 1px` : ""} minmax(0,1fr) ${l.right ? `1px ${l.rightW}px` : ""}` }}>
        {l.sidebar && (
          <>
            <aside className="zen-nav" aria-label="Navigator">
              <div className="zen-nav-tabs" role="tablist">
                {(
                  [
                    ["files", <Files size={14} />, "Navigator"],
                    ["search", <Search size={14} />, "Cari"],
                    ["git", <GitBranch size={14} />, "Git"],
                    ["todo", <ListTodo size={14} />, "TODO"],
                    ["run", <Bug size={14} />, "Run & Debug"],
                    ["ext", <Puzzle size={14} />, "Ekstensi"],
                    ...(hasViews ? ([["exviews", <Layers size={14} />, tl("Tampilan ekstensi")]] as const) : []),
                  ] as const
                ).map(([id, icon, label]) => (
                  <button key={id} role="tab" aria-selected={l.sideView === id} className={l.sideView === id ? "is-on" : ""} onClick={() => setLayout({ sideView: id })} title={label} aria-label={label}>
                    {icon}
                    {id === "git" && git?.files.length ? <span className="mini-count">{git.files.length}</span> : null}
                  </button>
                ))}
              </div>
              <div className="side-scroll">
                {l.sideView === "files" ? (
                  <>
                    <Section title={tl("Terbuka")}>
                      <OpenFiles />
                    </Section>
                    <Section title={tl("Ringkasan")}>
                      <Outline />
                    </Section>
                    <Section title={tl("Berkas")} defaultOpen={!!root}>
                      <FileTree />
                    </Section>
                    {penguin && (
                      <Section title="Kawanan">
                        <NoziProcesses />
                      </Section>
                    )}
                  </>
                ) : (
                  <SideContent />
                )}
              </div>
            </aside>
            <SideResizer side="left" />
          </>
        )}

        <main className="main zen-main">
          <div className="zen-column">
            <EditorGroups tabs={split} breadcrumb={false} />
          </div>
          {l.panel && (
            <>
              <SideResizer side="bottom" />
              <div className="zen-drawer" style={{ height: l.panelH }}>
                <div className="panel-head">
                  <PanelTabs />
                  <span className="spacer" />
                  <IconButton label={tl("Tutup")} onClick={() => A.togglePanel()}>
                    <X size={14} />
                  </IconButton>
                </div>
                <PanelContent />
              </div>
            </>
          )}
          <button className="omnibar" onClick={() => openPalette("")}>
            <TerminalSquare size={15} aria-hidden />
            <span>{tl("Tanya agen AI (?), jalankan perintah (>), atau buka berkas…")}</span>
            <Kbd keys="Mod+K" />
          </button>
        </main>

        {l.right && (
          <>
            <SideResizer side="right" />
            <aside className="right-panel zen-chat" aria-label={tl("Agen AI")}>
              <RightContent />
            </aside>
          </>
        )}
      </div>
      <StatusBar variant="zen" />
    </div>
  );
}
