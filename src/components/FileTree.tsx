import React from "react";
import { FileEntry } from "../types";
import { PenguinMascot } from "./PenguinMascot";
import { FileIcon } from "./FileIcon";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Trash2,
  FilePlus,
  FolderPlus,
  RotateCw,
  FolderCode,
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
  onNewFolder,
  onRefresh,
  onDeleteEntry,
  mascotMessage,
  onClearMascotMessage,
}) => {
  const projectName = projectPath ? projectPath.split("/").pop() : "No Folder Open";

  const renderEntryIcon = (entry: FileEntry) => {
    if (entry.is_dir) {
      return entry.isOpen ? (
        <FolderOpen size={14} color="#ffd166" className="folder-icon open" />
      ) : (
        <Folder size={14} color="#ffb703" className="folder-icon" />
      );
    }
    return <FileIcon filename={entry.name} extension={entry.extension} size={15} />;
  };

  const renderNodes = (nodes: FileEntry[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isSelected = activeFilePath === node.path;
      const paddingLeft = `${depth * 12 + 10}px`;

      return (
        <React.Fragment key={node.path}>
          <div
            className={`cyber-tree-node ${isSelected ? "cyber-active-node" : ""}`}
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
              <span className="cyber-arrow-icon">
                {node.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            ) : (
              <span style={{ width: 12, flexShrink: 0 }} />
            )}

            <span className="cyber-badge-wrapper">{renderEntryIcon(node)}</span>
            <span className="cyber-node-name" title={node.name}>
              {node.name}
            </span>

            <button
              className="btn-icon cyber-del-btn"
              title={`Delete ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEntry(node);
              }}
            >
              <Trash2 size={11} color="#f43f5e" />
            </button>
          </div>

          {node.is_dir && node.isOpen && node.children && (
            <div className="cyber-branch-group">{renderNodes(node.children, depth + 1)}</div>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <aside className="app-sidebar-cyber-card">
      {/* 1. Header with Compact Mecha-Tux Mascot */}
      <div className="cyber-card-header">
        <div className="cyber-brand-text">
          <div className="cyber-main-title">EXPLORER</div>
          <div className="cyber-sub-status truncate" title={projectPath || "Nozel Code Studio"}>
            <span className="status-blink" />
            <span>{projectName}</span>
          </div>
        </div>
        <div className="cyber-mascot-unit">
          <PenguinMascot
            customMessage={mascotMessage}
            onClearMessage={onClearMascotMessage}
          />
        </div>
      </div>

      {/* 2. Workspace Actions Bar */}
      <div className="cyber-section-bar">
        <span className="cyber-section-label">FILES</span>
        {projectPath && (
          <div className="flex items-center gap-1">
            <button
              className="btn-icon"
              title="New File"
              onClick={() => onNewFile(projectPath)}
            >
              <FilePlus size={13} className="text-slate-400 hover:text-white" />
            </button>
            <button
              className="btn-icon"
              title="New Folder"
              onClick={() => onNewFolder(projectPath)}
            >
              <FolderPlus size={13} className="text-slate-400 hover:text-white" />
            </button>
            <button
              className="btn-icon"
              title="Refresh Files"
              onClick={onRefresh}
            >
              <RotateCw size={12} className="text-slate-400 hover:text-white" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Directory Tree */}
      <div className="cyber-tree-scroll">
        {!projectPath ? (
          <div className="cyber-empty-state">
            <FolderCode size={28} className="text-slate-500 mb-2" />
            <p className="empty-sub">Belum ada folder proyek yang dibuka</p>
            <button className="cyber-btn-mount" onClick={onOpenFolder}>
              Buka Folder Proyek
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="cyber-empty-state">
            <p className="empty-sub">Folder masih kosong</p>
            <button className="cyber-btn-mount" onClick={() => onNewFile(projectPath)}>
              + Buat File Baru
            </button>
          </div>
        ) : (
          <div className="cyber-tree-body">{renderNodes(entries)}</div>
        )}
      </div>
    </aside>
  );
};

export default FileTree;
