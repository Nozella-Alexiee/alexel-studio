// Desain B — Zen Paper: terang hangat, tanpa activity bar & tab bar. Navigator di kiri
// (berkas terbuka, ringkasan simbol, tree), satu kolom fokus, omnibar di bawah.

import { ChevronDown, ChevronRight, Files, GitBranch, Play, Search, Sparkles, TerminalSquare, X, Focus, ListTodo } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as A from "../app/actions";
import { openPalette } from "../app/commands";
import { runActiveFile } from "../app/run";
import { FileIcon } from "../components/FileIcon";
import { PinguBrand, PinguProcesses, usePenguinVariant } from "../components/PenguinMascot";
import { IconButton, Kbd } from "../components/ui";
import * as docs from "../editor/documents";
import { extractSymbols } from "../editor/symbols";
import { relative } from "../lib/paths";
import { PanelContent, PanelTabs } from "../panels/BottomPanel";
import { FileTree } from "../panels/Explorer";
import { activeTab, getState, setLayout, useLayout, useStore } from "../state/store";
import { EditorGroups, RightContent, SideContent, SideResizer, StatusBar } from "./common";

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
  if (!ids.length) return <div className="hint pad-x">Belum ada. Tekan ⌘P.</div>;
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
              <button className="zen-x" aria-label={`Tutup ${t.name}`} onClick={(e) => { e.stopPropagation(); void A.closeTab(id, groups.findIndex((g) => g.tabs.includes(id))); }}>
                {t.dirty ? <span className="tab-dot" /> : <X size={12} />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function useDocVersion(path?: string) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!path) return;
    let t = 0;
    const off = docs.onDocTextChange((p) => {
      if (p !== path) return;
      clearTimeout(t);
      t = window.setTimeout(() => setV((x) => x + 1), 600);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [path]);
  return v;
}

function Outline() {
  const tab = useStore((s) => activeTab(s));
  const cursorLine = useStore((s) => s.cursor.line);
  const version = useDocVersion(tab?.kind === "text" ? tab.id : undefined);
  const syms = useMemo(() => {
    if (tab?.kind !== "text") return [];
    const d = docs.getDoc(tab.id);
    return d ? extractSymbols(d.langId, docs.currentText(tab.id) ?? "") : [];
  }, [tab?.id, tab?.kind, version]);
  if (!syms.length) return <div className="hint pad-x">Tidak ada simbol.</div>;
  const current = [...syms].reverse().find((s) => s.line <= cursorLine);
  return (
    <ul className="zen-outline">
      {syms.slice(0, 300).map((s, i) => (
        <li key={i}>
          <button className={`zen-sym ${s === current ? "is-on" : ""}`} style={{ paddingLeft: 10 + s.depth * 10 }} onClick={() => docs.revealPosition(getState().focusedGroup, s.line)}>
            <span className="zen-kind">{s.kind === "judul" ? "#" : s.kind === "kelas" || s.kind === "struct" ? "◇" : s.kind === "tipe" ? "T" : "ƒ"}</span>
            {s.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ZenShell() {
  const l = useLayout();
  const tab = useStore((s) => activeTab(s));
  const root = useStore((s) => s.root);
  const git = useStore((s) => s.git);
  const split = useStore((s) => s.groups.length > 1);
  const penguin = usePenguinVariant();
  const rel = tab?.kind === "text" || tab?.kind === "image" ? relative(root ?? "", tab.id) : tab?.name;

  return (
    <div className="shell shell-zen">
      <header className="titlebar" data-tauri-drag-region>
        <div className="traffic-space" data-tauri-drag-region />
        <PinguBrand />
        <div className="zen-crumb" data-tauri-drag-region>
          {root && <span className="zen-root">{root.split("/").pop()}</span>}
          {rel && (
            <>
              <span className="zen-slash">/</span>
              <b>{rel}</b>
              {tab?.dirty && <span className="zen-live" aria-label="belum disimpan">●</span>}
            </>
          )}
        </div>
        <div className="titlebar-actions">
          <button className="tbtn tone-run" onClick={() => void runActiveFile()} title="Jalankan (⌘R)">
            <Play size={14} /> Jalankan
          </button>
          <button className={`tbtn ${l.panel ? "is-on" : ""}`} onClick={() => A.togglePanel("terminal")} title="Terminal (⌃`)">
            <TerminalSquare size={14} /> Terminal
          </button>
          <button className={`tbtn ${l.right ? "is-on" : ""}`} onClick={() => A.toggleRight("claude")} title="Claude (⌘⌥B)">
            <Sparkles size={14} /> Claude
          </button>
          <IconButton label="Mode fokus" active={!l.sidebar && !l.right} onClick={() => setLayout(!l.sidebar && !l.right ? { sidebar: true } : { sidebar: false, right: false, panel: false })}>
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
                    <Section title="Terbuka">
                      <OpenFiles />
                    </Section>
                    <Section title="Ringkasan">
                      <Outline />
                    </Section>
                    <Section title="Berkas" defaultOpen={!!root}>
                      <FileTree />
                    </Section>
                    {penguin && (
                      <Section title="Kawanan">
                        <PinguProcesses />
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
                  <IconButton label="Tutup" onClick={() => A.togglePanel()}>
                    <X size={14} />
                  </IconButton>
                </div>
                <PanelContent />
              </div>
            </>
          )}
          <button className="omnibar" onClick={() => openPalette("")}>
            <TerminalSquare size={15} aria-hidden />
            <span>Tanya Claude (?), jalankan perintah (&gt;), atau buka berkas…</span>
            <Kbd keys="Mod+K" />
          </button>
        </main>

        {l.right && (
          <>
            <SideResizer side="right" />
            <aside className="right-panel zen-chat" aria-label="Claude">
              <RightContent />
            </aside>
          </>
        )}
      </div>
      <StatusBar variant="zen" />
    </div>
  );
}
