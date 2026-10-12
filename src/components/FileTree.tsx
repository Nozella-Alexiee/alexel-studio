import React from "react";
import { FileEntry } from "../types";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  RotateCw,
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
}) => {
  const getFileIcon = (entry: FileEntry) => {
    if (entry.is_dir) {
      return entry.isOpen ? (
        <FolderOpen size={14} color="#60a5fa" />
      ) : (
        <Folder size={14} color="#60a5fa" />
      );
    }

    const ext = entry.extension?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return <FileCode size={14} color="#3b82f6" />;
      case "js":
      case "jsx":
        return <FileCode size={14} color="#eab308" />;
      case "json":
        return <FileCode size={14} color="#f59e0b" />;
      case "py":
        return <FileCode size={14} color="#10b981" />;
      case "rs":
        return <FileCode size={14} color="#f97316" />;
      case "md":
        return <FileText size={14} color="#a855f7" />;
      case "html":
      case "css":
        return <FileCode size={14} color="#06b6d4" />;
      default:
        return <File size={14} color="var(--text-muted)" />;
    }
  };

  const renderNodes = (nodes: FileEntry[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isSelected = activeFilePath === node.path;
      const paddingLeft = `${depth * 14 + 8}px`;

      return (
        <React.Fragment key={node.path}>
          <div
            className={`tree-node ${isSelected ? "active" : ""}`}
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
                {node.isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            ) : (
              <span style={{ width: 13, flexShrink: 0 }} />
            )}

            <span className="tree-node-icon">{getFileIcon(node)}</span>
            <span className="tree-node-name" title={node.name}>
              {node.name}
            </span>

            <button
              className="btn-icon"
              title={`Delete ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEntry(node);
              }}
              style={{ padding: "2px", opacity: 0.6 }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
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
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Explorer</span>
        {projectPath && (
          <div className="sidebar-actions">
            <button
              className="btn-icon"
              title="New File"
              onClick={() => onNewFile(projectPath)}
            >
              <FilePlus size={14} />
            </button>
            <button
              className="btn-icon"
              title="New Folder"
              onClick={() => onNewFolder(projectPath)}
            >
              <FolderPlus size={14} />
            </button>
            <button
              className="btn-icon"
              title="Refresh Files"
              onClick={onRefresh}
            >
              <RotateCw size={13} />
            </button>
          </div>
        )}
      </div>

      {!projectPath ? (
        <div className="sidebar-empty">
          <FolderOpen size={36} color="var(--text-muted)" />
          <p style={{ fontSize: "12px", lineHeight: "1.4" }}>
            No project folder open.
            <br />
            Open a folder to start coding.
          </p>
          <button className="btn-primary" onClick={onOpenFolder}>
            Open Folder
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="sidebar-empty">
          <p style={{ fontSize: "12px" }}>Folder is empty</p>
          <button
            className="btn-secondary"
            onClick={() => onNewFile(projectPath)}
          >
            Create File
          </button>
        </div>
      ) : (
        <div className="sidebar-tree">{renderNodes(entries)}</div>
      )}
    </aside>
  );
};
