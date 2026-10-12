import React from "react";
import { FileEntry } from "../types";
import { PenguinMascot } from "./PenguinMascot";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Trash2,
} from "lucide-react";

interface FileTreeProps {
  entries: FileEntry[];
  projectPath: string | null;
  activeFilePath?: string;
  onSelectFile: (file: FileEntry) => void;
  onToggleDir: (dir: FileEntry) => void;
  onOpenFolder: () => void;
  onNewFile: (targetDir: string) => void;
  onNewFolder: (targetDir: string) => void;
  onRefresh: () => void;
  onDeleteEntry: (entry: FileEntry) => void;
  mascotMessage?: string | null;
  onClearMascotMessage?: () => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  entries,
  projectPath,
  activeFilePath,
  onSelectFile,
  onToggleDir,
  onOpenFolder,
  onNewFile,
  onDeleteEntry,
  mascotMessage,
  onClearMascotMessage,
}) => {
  // Render badge/icon exactly matching the Glass Mockup
  const renderEntryIcon = (entry: FileEntry) => {
    if (entry.is_dir) {
      const lower = entry.name.toLowerCase();
      let folderColor = "#3b82f6"; // default sleek blue folder
      if (lower.includes("src")) folderColor = "#22c55e"; // green for src/ as in mockup
      else if (lower.includes("core")) folderColor = "#64748b"; // muted slate for core/

      return entry.isOpen ? (
        <FolderOpen size={14} color={folderColor} />
      ) : (
        <Folder size={14} color={folderColor} />
      );
    }

    const ext = entry.extension?.toLowerCase();
    switch (ext) {
      case "tsx":
        return <span className="mockup-file-badge ts-badge">TS</span>;
      case "ts":
        return <span className="mockup-file-badge ts-badge">TS</span>;
      case "js":
      case "jsx":
        return <span className="mockup-file-badge js-badge">JS</span>;
      case "rs":
        return <span className="mockup-file-badge rs-badge">RS</span>;
      case "md":
        return <span className="mockup-file-badge md-badge">MD</span>;
      case "json":
        return <span className="mockup-file-badge json-badge">JS</span>;
      default:
        return <span className="mockup-file-badge txt-badge">TXT</span>;
    }
  };

  const renderNodes = (nodes: FileEntry[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isSelected = activeFilePath === node.path;
      const paddingLeft = `${depth * 14 + 10}px`;

      return (
        <React.Fragment key={node.path}>
          <div
            className={`tree-node ${isSelected ? "active-glass-file" : ""}`}
            style={{ paddingLeft }}
            onClick={(e) => {
              e.stopPropagation();
              if (node.is_dir) {
                onToggleDir(node);
              } else {
                onSelectFile(node);
              }
            }}
          >
            {node.is_dir ? (
              <span className="tree-node-icon">
                {node.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            ) : (
              <span style={{ width: 12, flexShrink: 0 }} />
            )}

            <span className="tree-node-icon">{renderEntryIcon(node)}</span>
            <span className="tree-node-name" title={node.name}>
              {node.name}
            </span>

            <button
              className="btn-icon tree-del-btn"
              title={`Hapus ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEntry(node);
              }}
            >
              <Trash2 size={11} color="var(--text-muted)" />
            </button>
          </div>

          {node.is_dir && node.isOpen && node.children && (
            <div>{renderNodes(node.children, depth + 1)}</div>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <aside className="app-sidebar-floating-card">
      {/* 1. Header with 'Nozel Code' stacked typography and 3D Tuxy peeking mascot (Exact from Glass Mockup) */}
      <div className="card-top-header-glass">
        <div className="card-brand-titles">
          <span className="brand-line-1">Nozel</span>
          <span className="brand-line-2">Code</span>
        </div>
        <div className="sidebar-mascot-peek">
          <PenguinMascot
            customMessage={mascotMessage}
            onClearMessage={onClearMascotMessage}
          />
        </div>
      </div>

      {/* 2. EXPLORER Section Header (from Glass Mockup) */}
      <div className="sidebar-section-header">
        <ChevronDown size={11} />
        <span>EXPLORER</span>
      </div>

      {/* 3. Explorer Tree Area */}
      <div className="sidebar-tree-container">
        {!projectPath ? (
          <div className="sidebar-empty">
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
              Belum ada folder proyek dibuka
            </p>
            <button className="btn-primary" onClick={onOpenFolder} style={{ fontSize: 11, padding: "5px 12px" }}>
              Buka Folder
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="sidebar-empty">
            <p style={{ fontSize: 11 }}>Folder kosong</p>
            <button className="btn-secondary" onClick={() => onNewFile(projectPath)}>
              Buat File
            </button>
          </div>
        ) : (
          <div className="sidebar-tree">{renderNodes(entries)}</div>
        )}
      </div>
    </aside>
  );
};
