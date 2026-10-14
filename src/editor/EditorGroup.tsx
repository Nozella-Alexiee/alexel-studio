import { AlertTriangle, ChevronRight, Columns2, Code2, Eye, Play, Settings as Cog, X } from "lucide-react";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import * as A from "../app/actions";
import { runActiveFile } from "../app/run";
import { FileIcon } from "../components/FileIcon";
import { openMenu } from "../components/Overlays";
import { IconButton, Segmented } from "../components/ui";
import { relative } from "../lib/paths";
import { setState, useStore, type Tab } from "../state/store";
import { CodeEditor } from "./CodeEditor";
import { HtmlPreview, ImageViewer, MarkdownPreview } from "./Previews";

const SettingsView = lazy(() => import("../panels/SettingsView"));
const Dashboard = lazy(() => import("../panels/Dashboard"));

function TabItem({ tab, group, active }: { tab: Tab; group: number; active: boolean }) {
  const mark = useStore((s) => s.gitMarks[tab.id]);
  const errors = useStore((s) => s.problems[tab.id]?.filter((p) => p.severity === "error").length ?? 0);
  const onMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: "Tutup", keys: "⌘W", run: () => void A.closeTab(tab.id, group) },
      { label: "Tutup tab lain", run: () => void A.closeOtherTabs(tab.id, group) },
      { label: "Tutup semua", run: () => void A.closeAllTabs() },
      { separator: true, label: "" },
      ...(tab.kind === "text" || tab.kind === "image"
        ? [
            { label: "Salin path", run: () => void A.copyPath(tab.id) },
            { label: "Salin path relatif", run: () => void A.copyPath(tab.id, true) },
            { label: "Tampilkan di Explorer", run: () => void A.revealInTree(tab.id) },
            { label: "Time-travel berkas ini", disabled: tab.kind !== "text", run: () => { setState({ historyFor: tab.id }); A.togglePanel("history"); } },
            { separator: true, label: "" },
            { label: "Belah ke kanan", keys: "⌘\\", run: () => { A.activateTab(tab.id, group); A.splitEditor(); } },
          ]
        : []),
    ]);
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-tab={tab.id}
      className={`tab ${active ? "is-active" : ""} ${tab.dirty ? "is-dirty" : ""} ${mark ? `git-${mark}` : ""} ${errors ? "has-errors" : ""}`}
      title={tab.kind === "text" || tab.kind === "image" ? tab.id : tab.name}
      onClick={() => A.activateTab(tab.id, group)}
      onAuxClick={(e) => e.button === 1 && void A.closeTab(tab.id, group)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && A.activateTab(tab.id, group)}
      onContextMenu={onMenu}
    >
      {tab.kind === "settings" ? <Cog size={14} aria-hidden /> : <FileIcon filename={tab.name} size={14} />}
      <span className="tab-name">{tab.name}</span>
      <button
        className="tab-close"
        aria-label={tab.dirty ? `${tab.name} belum disimpan — tutup` : `Tutup ${tab.name}`}
        onClick={(e) => {
          e.stopPropagation();
          void A.closeTab(tab.id, group);
        }}
      >
        <span className="tab-dot" aria-hidden />
        <X size={13} className="tab-x" aria-hidden />
      </button>
    </div>
  );
}

export function TabStrip({ group, extra }: { group: number; extra?: React.ReactNode }) {
  const g = useStore((s) => s.groups[group]);
  const tabs = useStore((s) => s.tabs);
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => {
    const el = ref.current;
    if (el) setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  // Tab aktif selalu terlihat; roda mouse vertikal menggulir tab ke samping (seperti VS Code).
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>(".tab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [g?.active, g?.tabs.length]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, []);
  if (!g) return null;
  return (
    <div className={`tabstrip ${edge.l ? "fade-l" : ""} ${edge.r ? "fade-r" : ""}`}>
      <div className="tabs" role="tablist" aria-label="Berkas terbuka" ref={ref} onScroll={measure}>
        {g.tabs.map((id) => tabs[id] && <TabItem key={id} tab={tabs[id]} group={group} active={g.active === id} />)}
      </div>
      <div className="tabstrip-actions">{extra}</div>
    </div>
  );
}

export function Breadcrumb({ path }: { path: string }) {
  const root = useStore((s) => s.root) ?? "";
  const rel = relative(root, path);
  const parts = rel.split("/");
  const rootName = root.split("/").pop();
  return (
    <nav className="crumbs" aria-label="Lokasi berkas">
      {root && path.startsWith(root) && (
        <>
          <span className="crumb">{rootName}</span>
          <ChevronRight size={12} className="crumb-sep" aria-hidden />
        </>
      )}
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={12} className="crumb-sep" aria-hidden />}
          <button className={`crumb ${i === parts.length - 1 ? "is-last" : ""}`} onClick={() => void A.revealInTree(path)}>
            {i === parts.length - 1 && <FileIcon filename={p} size={13} />}
            {p}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PreviewToggle({ tab }: { tab: Tab }) {
  if (tab.kind !== "text" || !/\.(md|markdown|mdx|html?)$/i.test(tab.id)) return null;
  return (
    <Segmented
      label="Mode pratinjau"
      value={tab.preview}
      onChange={(v) => A.setTabPreview(tab.id, v)}
      options={[
        { id: "code", label: <Code2 size={13} />, title: "Kode saja" },
        { id: "split", label: <Columns2 size={13} />, title: "Kode + pratinjau" },
        { id: "preview", label: <Eye size={13} />, title: "Pratinjau saja" },
      ]}
    />
  );
}

export function EditorActions({ group }: { group: number }) {
  const activeId = useStore((s) => s.groups[group]?.active ?? null);
  const tab = useStore((s) => (activeId ? s.tabs[activeId] : undefined));
  const split = useStore((s) => s.groups.length > 1);
  return (
    <>
      {tab && <PreviewToggle tab={tab} />}
      {tab?.kind === "text" && (
        <IconButton label="Jalankan berkas" keys="Mod+R" onClick={() => void runActiveFile()} tone="run">
          <Play size={14} />
        </IconButton>
      )}
      <IconButton label={split ? "Gabung editor" : "Belah editor"} keys="Mod+\" onClick={A.splitEditor} active={split}>
        <Columns2 size={14} />
      </IconButton>
    </>
  );
}

function ConflictBar({ tab }: { tab: Tab }) {
  if (!tab.conflict && !tab.missing) return null;
  return (
    <div className="banner banner-warning" role="alert">
      <AlertTriangle size={14} aria-hidden />
      {tab.missing ? (
        <span>Berkas ini sudah tidak ada di disk. Simpan untuk membuatnya lagi.</span>
      ) : (
        <>
          <span>Berkas berubah di disk dan kamu punya editan yang belum disimpan.</span>
          <button className="btn btn-sm" onClick={() => void import("../app/conflicts").then((m) => m.resolveConflict(tab.id))}>
            Selesaikan
          </button>
        </>
      )}
    </div>
  );
}

export function EditorBody({ group, breadcrumb = true }: { group: number; breadcrumb?: boolean }) {
  const activeId = useStore((s) => s.groups[group]?.active ?? null);
  const tab = useStore((s) => (activeId ? s.tabs[activeId] : undefined));
  const root = useStore((s) => s.root);

  if (!tab) {
    return (
      <div className="editor-body">
        <Suspense fallback={null}>
          <Dashboard />
        </Suspense>
      </div>
    );
  }
  if (tab.kind === "settings") {
    return (
      <div className="editor-body">
        <Suspense fallback={null}>
          <SettingsView />
        </Suspense>
      </div>
    );
  }
  if (tab.kind === "image") {
    return (
      <div className="editor-body">
        {breadcrumb && root && <Breadcrumb path={tab.id} />}
        <ImageViewer path={tab.id} />
      </div>
    );
  }
  const isMd = /\.(md|markdown|mdx)$/i.test(tab.id);
  const isHtml = /\.html?$/i.test(tab.id);
  const mode = isMd || isHtml ? tab.preview : "code";
  return (
    <div className="editor-body">
      {breadcrumb && <Breadcrumb path={tab.id} />}
      <ConflictBar tab={tab} />
      <div className={`editor-split mode-${mode}`}>
        <div className="editor-pane" hidden={mode === "preview"}>
          <CodeEditor group={group} path={tab.id} />
        </div>
        {mode !== "code" && <div className="preview-pane">{isMd ? <MarkdownPreview path={tab.id} /> : <HtmlPreview path={tab.id} />}</div>}
      </div>
    </div>
  );
}
