import { AlertTriangle, ChevronRight, Database, Globe, KeyRound, NotebookPen, Send, Columns2, Code2, Eye, Pin, Play, Puzzle, Settings as Cog, Sparkle, X } from "lucide-react";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import * as A from "../app/actions";
import { runActiveFile } from "../app/run";
import { FileIcon } from "../components/FileIcon";
import { openMenu } from "../components/Overlays";
import { IconButton, Segmented } from "../components/ui";
import { relative } from "../lib/paths";
import { isFileTab, setState, useStore, type Tab } from "../state/store";
import { CodeEditor } from "./CodeEditor";
import { useWebviews } from "../exthost/webview";
import { HtmlPreview, ImageViewer, MarkdownPreview } from "./Previews";
import { tl } from "../i18n";
import { isQueryFile } from "../db/sqlText";

const SettingsView = lazy(() => import("../panels/SettingsView"));
const ExtensionDetail = lazy(() => import("../panels/ExtensionDetail"));
const WebviewTab = lazy(() => import("../panels/WebviewTab"));
const Dashboard = lazy(() => import("../panels/Dashboard"));
const PdfViewer = lazy(() => import("./BinaryViews").then((m) => ({ default: m.PdfViewer })));
const HexViewer = lazy(() => import("./BinaryViews").then((m) => ({ default: m.HexViewer })));
const DbTab = lazy(() => import("../db/DbTab"));
const HttpTab = lazy(() => import("../http/HttpTab"));
const EnvTab = lazy(() => import("../env/EnvTab"));
const BrowserTab = lazy(() => import("../browser/BrowserTab"));
const NotebookView = lazy(() => import("../notebook/NotebookView"));
const EnvBar = lazy(() => import("../env/EnvBar").then((m) => ({ default: m.EnvBar })));
const HttpBar = lazy(() => import("../http/HttpBar").then((m) => ({ default: m.HttpBar })));
const SqlBar = lazy(() => import("../db/SqlBar").then((m) => ({ default: m.SqlBar })));
const WelcomePage = lazy(() => import("../panels/Dashboard").then((m) => ({ default: m.Welcome })));

/** Tab yang sedang diseret (dataTransfer tidak bisa dibaca saat dragover, jadi disimpan di sini). */
let dragTab: { id: string; group: number } | null = null;

/** Ikon tab webview: iconPath panel dari ekstensi bila ada (mis. logo Claude Code), selain itu ikon puzzle. */
function WebviewTabIcon({ tabId }: { tabId: string }) {
  const id = Number(tabId.slice(tabId.lastIndexOf(":") + 1));
  const light = useStore((s) => s.layouts && document.documentElement.dataset.scheme === "light");
  const icon = useWebviews((s) => (light ? s.panels[id]?.iconLight : s.panels[id]?.icon) ?? s.panels[id]?.icon);
  return icon ? <img src={icon} width={14} height={14} alt="" aria-hidden /> : <Puzzle size={14} aria-hidden />;
}

function TabItem({ tab, group, active, drop }: { tab: Tab; group: number; active: boolean; drop?: "before" | "after" | null }) {
  const mark = useStore((s) => s.gitMarks[tab.id]);
  const errors = useStore((s) => s.problems[tab.id]?.filter((p) => p.severity === "error").length ?? 0);
  const onMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: tl("Tutup"), keys: "Mod+W", run: () => void A.closeTab(tab.id, group) },
      { label: tl("Tutup tab lain"), run: () => void A.closeOtherTabs(tab.id, group) },
      { label: tl("Tutup semua"), run: () => void A.closeUnpinnedTabs() },
      { label: tab.pinned ? tl("Lepas sematan") : tl("Sematkan"), run: () => A.togglePinTab(tab.id) },
      { separator: true, label: "" },
      ...(isFileTab(tab.kind)
        ? [
            { label: tl("Salin path"), run: () => void A.copyPath(tab.id) },
            { label: tl("Salin path relatif"), run: () => void A.copyPath(tab.id, true) },
            { label: tl("Tampilkan di Explorer"), run: () => void A.revealInTree(tab.id) },
            { label: tl("Time-travel berkas ini"), disabled: tab.kind !== "text", run: () => { setState({ historyFor: tab.id }); A.togglePanel("history"); } },
            { separator: true, label: "" },
            { label: tl("Belah ke kanan"), keys: "Mod+\\", run: () => { A.activateTab(tab.id, group); A.splitEditor(); } },
          ]
        : []),
    ]);
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-tab={tab.id}
      className={`tab ${active ? "is-active" : ""} ${tab.pinned ? "is-pinned" : ""} ${tab.dirty ? "is-dirty" : ""} ${mark ? `git-${mark}` : ""} ${errors ? "has-errors" : ""} ${drop ? `drop-${drop}` : ""}`}
      draggable
      onDragStart={(e) => {
        dragTab = { id: tab.id, group };
        e.dataTransfer.setData("text/x-nozel-tab", tab.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("is-dragging");
      }}
      onDragEnd={(e) => {
        dragTab = null;
        e.currentTarget.classList.remove("is-dragging");
      }}
      title={isFileTab(tab.kind) ? tab.id : tab.name}
      onClick={() => A.activateTab(tab.id, group)}
      onAuxClick={(e) => e.button === 1 && !tab.pinned && void A.closeTab(tab.id, group)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && A.activateTab(tab.id, group)}
      onContextMenu={onMenu}
    >
      {tab.kind === "settings" ? <Cog size={14} aria-hidden /> : tab.kind === "webview" ? <WebviewTabIcon tabId={tab.id} /> : tab.kind === "extension" ? <Puzzle size={14} aria-hidden /> : tab.kind === "welcome" ? <Sparkle size={14} aria-hidden /> : tab.kind === "db" ? <Database size={14} aria-hidden /> : tab.kind === "http" ? <Send size={14} aria-hidden /> : tab.kind === "env" ? <KeyRound size={14} aria-hidden /> : tab.kind === "browser" ? <Globe size={14} aria-hidden /> : <FileIcon filename={tab.name} size={14} />}
      <span className="tab-name">{tab.name}</span>
      {tab.pinned ? (
        <button
          className="tab-close tab-pin"
          aria-label={tl("Lepas sematan {name}", { name: tab.name })}
          title={tl("Lepas sematan")}
          onClick={(e) => {
            e.stopPropagation();
            A.togglePinTab(tab.id);
          }}
        >
          <Pin size={12} aria-hidden />
        </button>
      ) : (
        <button
          className="tab-close"
          aria-label={tab.dirty ? tl("{name} belum disimpan — tutup", { name: tab.name }) : tl("Tutup {name}", { name: tab.name })}
          onClick={(e) => {
            e.stopPropagation();
            void A.closeTab(tab.id, group);
          }}
        >
          <span className="tab-dot" aria-hidden />
          <X size={13} className="tab-x" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function TabStrip({ group, extra }: { group: number; extra?: React.ReactNode }) {
  const g = useStore((s) => s.groups[group]);
  const tabs = useStore((s) => s.tabs);
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const [dropAt, setDropAt] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const onTabsDragOver = (e: React.DragEvent) => {
    const isPath = e.dataTransfer.types.includes("text/x-nozel-path");
    if (!dragTab && !isPath) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragTab ? "move" : "copy";
    const el = (e.target as HTMLElement).closest<HTMLElement>(".tab[data-tab]");
    if (!el) return setDropAt(null);
    const r = el.getBoundingClientRect();
    const side = e.clientX < r.left + r.width / 2 ? "before" : "after";
    const id = el.dataset.tab!;
    if (dropAt?.id !== id || dropAt.side !== side) setDropAt({ id, side });
  };
  const onTabsDrop = (e: React.DragEvent) => {
    const at = dropAt;
    setDropAt(null);
    const list = g?.tabs ?? [];
    const before = at ? (at.side === "before" ? at.id : list[list.indexOf(at.id) + 1] ?? null) : null;
    if (dragTab) {
      e.preventDefault();
      e.stopPropagation();
      A.moveTab(dragTab.id, dragTab.group, group, before);
      dragTab = null;
      return;
    }
    const p = e.dataTransfer.getData("text/x-nozel-path");
    if (p) {
      e.preventDefault();
      e.stopPropagation();
      void A.openFile(p, { group });
    }
  };
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
      <div
        className="tabs"
        role="tablist"
        aria-label={tl("Berkas terbuka")}
        ref={ref}
        onScroll={measure}
        onDragOver={onTabsDragOver}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}
        onDrop={onTabsDrop}
      >
        {g.tabs.map((id) => tabs[id] && <TabItem key={id} tab={tabs[id]} group={group} active={g.active === id} drop={dropAt?.id === id ? dropAt.side : null} />)}
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
    <nav className="crumbs" aria-label={tl("Lokasi berkas")}>
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
  if (tab.kind === "text" && /\.ipynb$/i.test(tab.id))
    return (
      <Segmented
        label={tl("Tampilan notebook")}
        value={tab.preview === "code" ? "code" : "preview"}
        onChange={(v) => A.setTabPreview(tab.id, v)}
        options={[
          { id: "preview", label: <NotebookPen size={13} />, title: "Notebook" },
          { id: "code", label: <Code2 size={13} />, title: "JSON" },
        ]}
      />
    );
  if (tab.kind !== "text" || !/\.(md|markdown|mdx|html?)$/i.test(tab.id)) return null;
  return (
    <Segmented
      label={tl("Mode pratinjau")}
      value={tab.preview}
      onChange={(v) => A.setTabPreview(tab.id, v)}
      options={[
        { id: "code", label: <Code2 size={13} />, title: tl("Kode saja") },
        { id: "split", label: <Columns2 size={13} />, title: tl("Kode + pratinjau") },
        { id: "preview", label: <Eye size={13} />, title: tl("Pratinjau saja") },
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
        <IconButton label={tl("Jalankan berkas")} keys="Mod+R" onClick={() => void runActiveFile()} tone="run">
          <Play size={14} />
        </IconButton>
      )}
      <IconButton label={split ? "Gabung editor" : tl("Belah editor")} keys="Mod+\" onClick={A.splitEditor} active={split}>
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
        <span>{tl("Berkas ini sudah tidak ada di disk. Simpan untuk membuatnya lagi.")}</span>
      ) : (
        <>
          <span>{tl("Berkas berubah di disk dan kamu punya editan yang belum disimpan.")}</span>
          <button className="btn btn-sm" onClick={() => void import("../app/conflicts").then((m) => m.resolveConflict(tab.id))}>
            Selesaikan
          </button>
        </>
      )}
    </div>
  );
}

/** Seret tab/berkas ke area editor: separuh kiri = buka di sini, tepi kanan (grup kiri) = belah ke kanan. */
function useDropZone(group: number) {
  const [zone, setZone] = useState<null | "here" | "right">(null);
  const accepts = (e: React.DragEvent) => !!dragTab || e.dataTransfer.types.includes("text/x-nozel-path");
  const props = {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dragTab ? "move" : "copy";
      const r = e.currentTarget.getBoundingClientRect();
      const z = group === 0 && e.clientX - r.left > r.width * 0.6 ? "right" : "here";
      if (z !== zone) setZone(z);
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setZone(null);
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const target = zone === "right" ? 1 : group;
      setZone(null);
      if (dragTab) {
        if (dragTab.group !== target) A.moveTab(dragTab.id, dragTab.group, target);
        else A.activateTab(dragTab.id, target);
        dragTab = null;
        return;
      }
      const p = e.dataTransfer.getData("text/x-nozel-path");
      if (p) void A.openFile(p, { group: target });
    },
  };
  const overlay = zone ? (
    <div className="drop-overlay" aria-hidden>
      <div className={`drop-zone is-here ${zone === "here" ? "is-hot" : ""}`}>{tl("Buka di sini")}</div>
      {group === 0 && (
        <div className={`drop-zone is-right ${zone === "right" ? "is-hot" : ""}`}>
          <Columns2 size={22} />
          {tl("Belah ke kanan")}
        </div>
      )}
    </div>
  ) : null;
  return { props, overlay };
}

export function EditorBody({ group, breadcrumb = true }: { group: number; breadcrumb?: boolean }) {
  const drop = useDropZone(group);
  const activeId = useStore((s) => s.groups[group]?.active ?? null);
  const tab = useStore((s) => (activeId ? s.tabs[activeId] : undefined));
  const root = useStore((s) => s.root);

  if (!tab) {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <Dashboard />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "welcome") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <WelcomePage />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "webview") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <WebviewTab tabId={tab.id} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "browser") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <BrowserTab tabId={tab.id} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "env") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <EnvTab tabId={tab.id} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "http") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <HttpTab tabId={tab.id} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "db") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <DbTab tabId={tab.id} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "extension") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <ExtensionDetail id={tab.id.replace(/^nozel:ext:/, "")} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "settings") {
    return (
      <div className="editor-body" {...drop.props}>
        <Suspense fallback={null}>
          <SettingsView />
        </Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "pdf" || tab.kind === "binary") {
    return (
      <div className="editor-body" {...drop.props}>
        {breadcrumb && root && <Breadcrumb path={tab.id} />}
        <Suspense fallback={null}>{tab.kind === "pdf" ? <PdfViewer path={tab.id} /> : <HexViewer path={tab.id} />}</Suspense>
        {drop.overlay}
      </div>
    );
  }
  if (tab.kind === "image") {
    return (
      <div className="editor-body" {...drop.props}>
        {breadcrumb && root && <Breadcrumb path={tab.id} />}
        <ImageViewer path={tab.id} />
        {drop.overlay}
      </div>
    );
  }
  if (/\.ipynb$/i.test(tab.id) && tab.preview !== "code")
    return (
      <div className="editor-body" {...drop.props}>
        {breadcrumb && <Breadcrumb path={tab.id} />}
        <ConflictBar tab={tab} />
        <Suspense fallback={null}>
          <NotebookView path={tab.id} />
        </Suspense>
        {drop.overlay}
      </div>
    );
  const isMd = /\.(md|markdown|mdx)$/i.test(tab.id);
  const isHtml = /\.html?$/i.test(tab.id);
  const mode = isMd || isHtml ? tab.preview : "code";
  return (
    <div className="editor-body" {...drop.props}>
      {breadcrumb && <Breadcrumb path={tab.id} />}
      <ConflictBar tab={tab} />
      {isQueryFile(tab.id) && (
        <Suspense fallback={null}>
          <SqlBar path={tab.id} group={group} />
        </Suspense>
      )}
      {/(^|[\\/])\.env(\.[\w.-]+)?$/.test(tab.id) && !/\.(example|sample|template|dist)$/i.test(tab.id) && (
        <Suspense fallback={null}>
          <EnvBar path={tab.id} />
        </Suspense>
      )}
      {/\.(http|rest)$/i.test(tab.id) && (
        <Suspense fallback={null}>
          <HttpBar path={tab.id} group={group} />
        </Suspense>
      )}
      <div className={`editor-split mode-${mode}`}>
        <div className="editor-pane" hidden={mode === "preview"}>
          <CodeEditor group={group} path={tab.id} />
        </div>
        {mode !== "code" && <div className="preview-pane">{isMd ? <MarkdownPreview path={tab.id} /> : <HtmlPreview path={tab.id} />}</div>}
      </div>
      {drop.overlay}
    </div>
  );
}
