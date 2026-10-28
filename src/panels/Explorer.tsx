import { ChevronRight, FilePlus2, FolderPlus, ListCollapse, RefreshCw } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import * as A from "../app/actions";
import { FileIcon, FolderIcon } from "../components/FileIcon";
import { openMenu } from "../components/Overlays";
import { IconButton } from "../components/ui";
import { basename, dirname } from "../lib/paths";
import type { FileEntry } from "../lib/types";
import { activeTabId, getState, setState, useStore } from "../state/store";
import { fileManagerName } from "../lib/keys";
import { isMac } from "../lib/ipc";
import { tl } from "../i18n";

interface Row {
  entry: FileEntry;
  depth: number;
  /** Baris akar folder workspace (multi-root). */
  root?: boolean;
}

function useRows(root: string | null): Row[] {
  const dirs = useStore((s) => s.dirs);
  const expanded = useStore((s) => s.expanded);
  const extra = useStore((s) => s.extraRoots);
  return useMemo(() => {
    if (!root) return [];
    const out: Row[] = [];
    const walk = (dir: string, depth: number) => {
      for (const e of dirs[dir] ?? []) {
        out.push({ entry: e, depth });
        if (e.is_dir && expanded[e.path]) walk(e.path, depth + 1);
      }
    };
    if (!extra.length) {
      walk(root, 0);
      return out;
    }
    // Multi-root: tiap folder workspace jadi baris akar yang bisa dilipat (seperti VS Code).
    for (const r of [root, ...extra]) {
      out.push({ entry: { name: basename(r), path: r, is_dir: true, is_symlink: false }, depth: 0, root: true });
      if (expanded[r]) walk(r, 1);
    }
    return out;
  }, [root, dirs, expanded, extra]);
}

const MARK_LABEL: Record<string, string> = { M: tl("Diubah"), U: tl("Baru (untracked)"), A: tl("Ditambahkan"), D: tl("Dihapus"), "!": tl("Konflik") };

function TreeRow({ row, active, focused, onFocusRow }: { row: Row; active: boolean; focused: boolean; onFocusRow: () => void }) {
  const { entry, depth } = row;
  const isMainRoot = useStore((s) => row.root && s.root === entry.path);
  const open = useStore((s) => !!s.expanded[entry.path]);
  const mark = useStore((s) => (entry.is_dir ? null : s.gitMarks[entry.path]));
  const dirMark = useStore((s) => (entry.is_dir ? !!s.gitDirs[entry.path] : false));
  const errors = useStore((s) => (entry.is_dir ? 0 : s.problems[entry.path]?.filter((p) => p.severity === "error").length ?? 0));
  const [dropOver, setDropOver] = useState(false);

  const activate = () => {
    onFocusRow();
    setState({ selectedTreePath: entry.path });
    if (entry.is_dir) void A.toggleDir(entry.path);
    else void A.openFile(entry.path);
  };

  const menu = (e: React.MouseEvent) => {
    onFocusRow();
    setState({ selectedTreePath: entry.path });
    if (row.root) {
      return openMenu(e, [
        { label: tl("Berkas baru…"), run: () => void A.newFile(entry.path) },
        { label: tl("Folder baru…"), run: () => void A.newFolder(entry.path) },
        { separator: true, label: "" },
        { label: tl("Tambah folder ke workspace…"), run: () => void A.addWorkspaceFolder() },
        { label: tl("Hapus folder dari workspace"), disabled: !!isMainRoot, run: () => A.removeWorkspaceFolder(entry.path) },
        { label: tl("Simpan workspace sebagai…"), run: () => void A.saveWorkspaceAs() },
        { separator: true, label: "" },
        { label: tl("Salin path"), run: () => void A.copyPath(entry.path) },
        { label: tl("Tampilkan di {app}", { app: fileManagerName() }), run: () => void import("../lib/ipc").then((m) => m.api.reveal(entry.path)) },
        { label: tl("Buka terminal di sini"), run: () => void import("../terminal/terminals").then((m) => m.newTerminal({ cwd: entry.path, title: basename(entry.path) })) },
      ]);
    }
    openMenu(e, [
      ...(entry.is_dir
        ? [
            { label: tl("Berkas baru…"), run: () => void A.newFile(entry.path) },
            { label: tl("Folder baru…"), run: () => void A.newFolder(entry.path) },
            { separator: true, label: "" },
          ]
        : [
            { label: tl("Buka"), run: () => void A.openFile(entry.path) },
            { label: tl("Buka di sisi kanan"), run: () => void A.openFile(entry.path, { group: 1 }) },
            ...(/\.code-workspace$/i.test(entry.name) ? [{ label: tl("Buka sebagai workspace"), run: () => void A.openWorkspaceFile(entry.path) }] : []),
            { separator: true, label: "" },
          ]),
      { label: tl("Ganti nama…"), keys: "↵", run: () => void A.renamePath(entry.path) },
      { label: tl("Duplikat"), run: () => void A.duplicatePath(entry.path) },
      { label: tl("Salin path"), run: () => void A.copyPath(entry.path) },
      { label: tl("Salin path relatif"), run: () => void A.copyPath(entry.path, true) },
      { label: tl("Tampilkan di {app}", { app: fileManagerName() }), run: () => void import("../lib/ipc").then((m) => m.api.reveal(entry.path)) },
      ...(entry.is_dir ? [{ label: tl("Buka terminal di sini"), run: () => void import("../terminal/terminals").then((m) => m.newTerminal({ cwd: entry.path, title: basename(entry.path) })) }] : []),
      { separator: true, label: "" },
      { label: tl("Pindahkan ke Trash"), keys: isMac ? "Mod+Backspace" : "Delete", danger: true, run: () => void A.deletePath(entry.path) },
    ]);
  };

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={entry.is_dir ? open : undefined}
      aria-selected={active}
      tabIndex={focused ? 0 : -1}
      data-path={entry.path}
      className={`tree-row ${row.root ? "is-root" : ""} ${active ? "is-active" : ""} ${dropOver ? "is-drop" : ""} ${mark ? `git-${mark}` : ""} ${errors ? "has-errors" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={activate}
      onContextMenu={menu}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-nozel-path", entry.path);
        // copyMove: bisa dipindah ke folder lain di pohon, atau "disalin" ke editor (= dibuka).
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      onDragOver={(e) => {
        if (!entry.is_dir || !e.dataTransfer.types.includes("text/x-nozel-path")) return;
        e.preventDefault();
        setDropOver(true);
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={(e) => {
        setDropOver(false);
        const from = e.dataTransfer.getData("text/x-nozel-path");
        if (from && entry.is_dir) {
          e.preventDefault();
          void A.movePath(from, entry.path);
        }
      }}
    >
      {entry.is_dir ? <ChevronRight size={13} className={`tree-chev ${open ? "is-open" : ""}`} aria-hidden /> : <span className="tree-chev-space" />}
      {entry.is_dir ? <FolderIcon name={entry.name} open={open} /> : <FileIcon filename={entry.name} size={15} />}
      <span className="tree-name">{entry.name}</span>
      {errors > 0 && <span className="tree-badge tone-danger-fg">{errors}</span>}
      {mark && (
        <span className="tree-git" title={MARK_LABEL[mark]}>
          {mark}
        </span>
      )}
      {dirMark && <span className="tree-git-dot" aria-label={tl("Berisi perubahan")} />}
    </div>
  );
}

export function FileTree() {
  const root = useStore((s) => s.root);
  const rows = useRows(root);
  const active = useStore((s) => activeTabId(s));
  const selectedTreePath = useStore((s) => s.selectedTreePath);
  const [focusIdx, setFocusIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const i = Math.min(focusIdx, rows.length - 1);
      const row = rows[i];
      const move = (n: number) => {
        e.preventDefault();
        const j = Math.max(0, Math.min(rows.length - 1, n));
        setFocusIdx(j);
        setState({ selectedTreePath: rows[j].entry.path });
        box.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(rows[j].entry.path)}"]`)?.focus();
      };
      if (!row) return;
      if (e.key === "ArrowDown") move(i + 1);
      else if (e.key === "ArrowUp") move(i - 1);
      else if (e.key === "ArrowRight" && row.entry.is_dir) {
        e.preventDefault();
        if (!getState().expanded[row.entry.path]) void A.toggleDir(row.entry.path, true);
        else move(i + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (row.entry.is_dir && getState().expanded[row.entry.path]) void A.toggleDir(row.entry.path, false);
        else {
          const parent = dirname(row.entry.path);
          const pi = rows.findIndex((r) => r.entry.path === parent);
          if (pi >= 0) move(pi);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        void A.renamePath(row.entry.path);
      } else if (e.key === " ") {
        e.preventDefault();
        if (row.entry.is_dir) void A.toggleDir(row.entry.path);
        else void A.openFile(row.entry.path);
      } else if ((e.key === "Backspace" && e.metaKey && isMac) || (e.key === "Delete" && !isMac)) {
        e.preventDefault();
        void A.deletePath(row.entry.path);
      }
    },
    [focusIdx, rows]
  );

  if (!root) {
    return (
      // Halaman Welcome sudah menampilkan daftar project; di sini cukup petunjuk singkat.
      <div className="tree-empty-hint">
        Pilih project di halaman sambutan, atau{" "}
        <button className="link" onClick={() => void A.openProjectDialog()}>
          {tl("buka folder")}
        </button>
        .
      </div>
    );
  }
  return (
    <div
      ref={box}
      className="tree"
      role="tree"
      aria-label={tl("Berkas project")}
      onKeyDown={onKey}
      onContextMenu={(e) =>
        e.target === e.currentTarget &&
        openMenu(e, [
          { label: tl("Berkas baru…"), run: () => void A.newFile(root) },
          { label: tl("Folder baru…"), run: () => void A.newFolder(root) },
          { separator: true, label: "" },
          { label: tl("Tambah folder ke workspace…"), run: () => void A.addWorkspaceFolder() },
        ])
      }
      onDragOver={(e) => e.dataTransfer.types.includes("text/x-nozel-path") && e.preventDefault()}
      onDrop={(e) => {
        const from = e.dataTransfer.getData("text/x-nozel-path");
        if (from && e.target === e.currentTarget) void A.movePath(from, root);
      }}
    >
      {rows.map((r, i) => (
        <TreeRow key={r.entry.path} row={r} active={r.entry.path === (selectedTreePath ?? active)} focused={i === Math.min(focusIdx, rows.length - 1)} onFocusRow={() => { setFocusIdx(i); setState({ selectedTreePath: r.entry.path }); }} />
      ))}
      {rows.length === 0 && <div className="empty-body pad">{tl("Folder ini kosong.")}</div>}
    </div>
  );
}

export function ExplorerHeader({ title = "Explorer" }: { title?: string }) {
  const root = useStore((s) => s.root);
  const selectedTreePath = useStore((s) => s.selectedTreePath);
  return (
    <div className="side-head">
      <span className="side-title">{title}</span>
      {root && (
        <div className="side-actions">
          <IconButton label={tl("Berkas baru")} keys="Mod+N" onClick={() => void A.newFile(selectedTreePath)}>
            <FilePlus2 size={14} />
          </IconButton>
          <IconButton label={tl("Folder baru")} onClick={() => void A.newFolder(selectedTreePath)}>
            <FolderPlus size={14} />
          </IconButton>
          <IconButton label={tl("Muat ulang")} onClick={() => void A.refreshTree()}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton label={tl("Tutup semua folder")} onClick={() => setState({ expanded: Object.fromEntries(A.workspaceRoots().map((r) => [r, true])), selectedTreePath: null })}>
            <ListCollapse size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
