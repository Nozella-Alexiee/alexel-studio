import React from "react";
import { ThemeMode, SystemFootprint } from "../types";
import {
  Sun,
  Moon,
  FolderOpen,
  Sparkles,
  Zap,
} from "lucide-react";

interface TitleBarProps {
  projectName?: string;
  activeFileName?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenFolder: () => void;
  isClaudePanelOpen: boolean;
  onToggleClaudePanel: () => void;
  footprint?: SystemFootprint;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  projectName,
  activeFileName,
  theme,
  onToggleTheme,
  onOpenFolder,
  isClaudePanelOpen,
  onToggleClaudePanel,
  footprint,
}) => {
  return (
    <header className="app-titlebar">
      <div className="titlebar-center">
        <div className="titlebar-brand">
          <Zap size={14} className="text-blue-400" color="#3b82f6" />
          <span>Nozel Code</span>
        </div>

        {projectName && (
          <>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: "var(--text-secondary)" }}>{projectName}</span>
          </>
        )}

        {activeFileName && (
          <>
            <span style={{ color: "var(--text-muted)" }}>—</span>
            <span style={{ color: "var(--text-main)", fontWeight: 500 }}>
              {activeFileName}
            </span>
          </>
        )}

        {footprint && (
          <span
            className="titlebar-badge"
            title={`RAM: ${footprint.app_memory_mb} MB vs VS Code typical ~${footprint.vscode_baseline_mb} MB. Estimated ${footprint.savings_percentage}% memory reduction.`}
          >
            {footprint.app_memory_mb} MB RAM ({footprint.savings_percentage}% &lt; VS Code)
          </span>
        )}
      </div>

      <div className="titlebar-actions">
        <button
          className="btn-secondary"
          onClick={onOpenFolder}
          title="Open Project Folder (Cmd+O)"
          style={{ padding: "4px 8px", fontSize: "11.5px" }}
        >
          <FolderOpen size={13} />
          <span>Open Folder</span>
        </button>

        <button
          className={`btn-icon ${isClaudePanelOpen ? "active" : ""}`}
          onClick={onToggleClaudePanel}
          title="Claude Code Pro Companion Bridge"
          style={{
            color: isClaudePanelOpen ? "var(--accent-color)" : "var(--text-secondary)",
          }}
        >
          <Sparkles size={15} />
        </button>

        <button
          className="btn-icon"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
};
