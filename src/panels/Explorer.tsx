import { ChevronRight, FilePlus2, FolderPlus, ListCollapse, RefreshCw } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import * as A from "../app/actions";
import { FileIcon, FolderIcon } from "../components/FileIcon";
import { openMenu } from "../components/Overlays";
import { IconButton } from "../components/ui";
import { basename, dirname } from "../lib/paths";
import type { FileEntry } from "../lib/types";
import { activeTabId, getState, setState, useStore } from "../state/store";

interface Row {
  entry: FileEntry;
  depth: number;
}

function useRows(root: string | null): Row[] {
  const dirs = useStore((s) => s.dirs);
  const expanded = useStore((s) => s.expanded);
  return useMemo(() => {
    if (!root) return [];
    const out: Row[] = [];
    const walk = (dir: string, depth: number) => {
      for (const e of dirs[dir] ?? []) {
        out.push({ entry: e, depth });
        if (e.is_dir && expanded[e.path]) walk(e.path, depth + 1);
      }
    };
    walk(root, 0);
    return out;
  }, [root, dirs, expanded]);
}

const MARK_LABEL: Record<string, string> = { M: "Diubah", U: "Baru (untracked)", A: "Ditambahkan", D: "Dihapus", "!": "Konflik" };

function TreeRow({ row, active, focused, onFocusRow }: { row: Row; active: boolean; focused: boolean; onFocusRow: () => void }) {
  const { entry, depth } = row;
  const open = useStore((s) => !!s.expanded[entry.path]);
  const mark = useStore((s) => (entry.is_dir ? null : s.gitMarks[entry.path]));
  const dirMark = useStore((s) => (entry.is_dir ? !!s.gitDirs[entry.path] : false));
  const errors = useStore((s) => (entry.is_dir ? 0 : s.problems[entry.path]?.filter((p) => p.severity === "error").length ?? 0));
  const [dropOver, setDropOver] = useState(false);

  const activate = () => {
    onFocusRow();
    if (entry.is_dir) void A.toggleDir(entry.path);
    else void A.openFile(entry.path);
  };

  const menu = (e: React.MouseEvent) => {
    onFocusRow();
    openMenu(e, [
      ...(entry.is_dir
        ? [
            { label: "Berkas baru…", run: () => void A.newFile(entry.path) },
            { label: "Folder baru…", run: () => void A.newFolder(entry.path) },
            { separator: true, label: "" },
          ]
        : [
            { label: "Buka", run: () => void A.openFile(entry.path) },
            { label: "Buka di sisi kanan", run: () => void A.openFile(entry.path, { group: 1 }) },
            { separator: true, label: "" },
          ]),
      { label: "Ganti nama…", keys: "↵", run: () => void A.renamePath(entry.path) },
      { label: "Duplikat", run: () => void A.duplicatePath(entry.path) },
      { label: "Salin path", run: () => void A.copyPath(entry.path) },
      { label: "Salin path relatif", run: () => void A.copyPath(entry.path, true) },
      { label: "Tampilkan di Finder", run: () => void import("../lib/ipc").then((m) => m.api.reveal(entry.path)) },
      ...(entry.is_dir ? [{ label: "Buka terminal di sini", run: () => void import("../terminal/terminals").then((m) => m.newTerminal({ cwd: entry.path, title: basename(entry.path) })) }] : []),
      { separator: true, label: "" },
      { label: "Pindahkan ke Trash", keys: "⌘⌫", danger: true, run: () => void A.deletePath(entry.path) },
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
      className={`tree-row ${active ? "is-active" : ""} ${dropOver ? "is-drop" : ""} ${mark ? `git-${mark}` : ""} ${errors ? "has-errors" : ""}`}
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
      {dirMark && <span className="tree-git-dot" aria-label="Berisi perubahan" />}
    </div>
  );
}

export function FileTree() {
  const root = useStore((s) => s.root);
  const rows = useRows(root);
  const active = useStore((s) => activeTabId(s));
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
      } else if (e.key === "Backspace" && e.metaKey) {
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
          buka folder
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
      aria-label="Berkas project"
      onKeyDown={onKey}
      onContextMenu={(e) =>
        e.target === e.currentTarget &&
        openMenu(e, [
          { label: "Berkas baru…", run: () => void A.newFile(root) },
          { label: "Folder baru…", run: () => void A.newFolder(root) },
        ])
      }
      onDragOver={(e) => e.dataTransfer.types.includes("text/x-nozel-path") && e.preventDefault()}
      onDrop={(e) => {
        const from = e.dataTransfer.getData("text/x-nozel-path");
        if (from && e.target === e.currentTarget) void A.movePath(from, root);
      }}
    >
      {rows.map((r, i) => (
        <TreeRow key={r.entry.path} row={r} active={r.entry.path === active} focused={i === Math.min(focusIdx, rows.length - 1)} onFocusRow={() => setFocusIdx(i)} />
      ))}
      {rows.length === 0 && <div className="empty-body pad">Folder ini kosong.</div>}
    </div>
  );
}

export function ExplorerHeader({ title = "Explorer" }: { title?: string }) {
  const root = useStore((s) => s.root);
  return (
    <div className="side-head">
      <span className="side-title">{title}</span>
      {root && (
        <div className="side-actions">
          <IconButton label="Berkas baru" keys="Mod+N" onClick={() => void A.newFile(null)}>
            <FilePlus2 size={14} />
          </IconButton>
          <IconButton label="Folder baru" onClick={() => void A.newFolder(null)}>
            <FolderPlus size={14} />
          </IconButton>
          <IconButton label="Muat ulang" onClick={() => void A.refreshTree()}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton label="Tutup semua folder" onClick={() => setState({ expanded: root ? { [root]: true } : {} })}>
            <ListCollapse size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
