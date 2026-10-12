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
  Terminal,
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
  // Render official programming language logos
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
                {node.isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </span>
            ) : (
              <span style={{ width: 11, flexShrink: 0 }} />
            )}

            <span className="cyber-badge-wrapper">{renderEntryIcon(node)}</span>
            <span className="cyber-node-name" title={node.name}>
              {node.name}
            </span>

            <button
              className="btn-icon cyber-del-btn"
              title={`Purge ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEntry(node);
              }}
            >
              <Trash2 size={10} color="#f43f5e" />
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
      {/* 1. Futuristic Header with Mecha-Tux Cyber Mascot */}
      <div className="cyber-card-header">
        <div className="cyber-brand-text">
          <div className="cyber-main-title">NOZEL // CODE</div>
          <div className="cyber-sub-status">
            <span className="status-blink" />
            <span>M1 SILICON CORE</span>
          </div>
        </div>
        <div className="cyber-mascot-unit">
          <PenguinMascot
            customMessage={mascotMessage}
            onClearMessage={onClearMascotMessage}
          />
        </div>
      </div>

      {/* 2. Cyber HUD Directory Label */}
      <div className="cyber-section-bar">
        <span className="cyber-section-label">// WORKSPACE_INDEX</span>
        <span className="cyber-section-line" />
      </div>

      {/* 3. Futuristic Directory Tree */}
      <div className="cyber-tree-scroll">
        {!projectPath ? (
          <div className="cyber-empty-state">
            <Terminal size={22} color="#00f0ff" style={{ opacity: 0.8, marginBottom: 8 }} />
            <p className="empty-sub">NO WORKSPACE ATTACHED</p>
            <button className="cyber-btn-mount" onClick={onOpenFolder}>
              [ MOUNT DIRECTORY ]
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="cyber-empty-state">
            <p className="empty-sub">EMPTY ROOT DIRECTORY</p>
            <button className="cyber-btn-mount" onClick={() => onNewFile(projectPath)}>
              [ INITIALIZE FILE ]
            </button>
          </div>
        ) : (
          <div className="cyber-tree-body">{renderNodes(entries)}</div>
        )}
      </div>
    </aside>
  );
};
