import React from "react";
import { ClaudeCliInfo, EditorTab, SystemFootprint } from "../types";
import { Sparkles, GitBranch, XCircle, AlertTriangle } from "lucide-react";

interface StatusBarProps {
  activeTab?: EditorTab;
  footprint?: SystemFootprint;
  claudeInfo?: ClaudeCliInfo;
  onToggleClaude: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  footprint,
  claudeInfo,
  onToggleClaude,
}) => {
  return (
    <footer className="app-statusbar">
      {/* Left Git branch pill & diagnostics (Exact from Glass Mockup) */}
      <div className="statusbar-section">
        <div className="statusbar-git-purple-pill" title="Git Branch: main">
          <GitBranch size={11} color="#ffffff" />
        </div>
        <div className="statusbar-item" style={{ gap: 5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <XCircle size={10} color="#94a3b8" /> 0
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <AlertTriangle size={10} color="#94a3b8" /> 0
          </span>
        </div>
      </div>

      {/* Right Metrics and Badges (Exact from Glass Mockup) */}
      <div className="statusbar-section">
        <div className="statusbar-item">
          <span>Ln {activeTab?.line || 24}, Col {activeTab?.col || 18}</span>
        </div>
        <div className="statusbar-item">
          <span>Spaces: 4</span>
        </div>
        <div className="statusbar-item">
          <span>UTF-8</span>
        </div>
        <div className="statusbar-item">
          <span>LF</span>
        </div>
        <div className="statusbar-item">
          <span>{activeTab?.language === "typescript" ? "TypeScript React" : activeTab?.language || "TypeScript React"}</span>
        </div>

        {/* Cyan RAM Footprint Badge (Exact from Glass Mockup: RAM: 38 MB) */}
        <div
          className="statusbar-ram-glass"
          title={`Nozel Code RAM: ${footprint?.app_memory_mb || 38.4} MB vs VS Code ~650 MB (${footprint?.savings_percentage || 94}% lebih hemat)`}
        >
          <span>RAM: {footprint ? `${Math.round(footprint.app_memory_mb)} MB` : "38 MB"}</span>
        </div>

        {/* Amber Glowing Claude Pro Pill Badge (Exact from Glass Mockup: Claude Pro ✨) */}
        <button
          className="statusbar-claude-pill"
          onClick={onToggleClaude}
          title={claudeInfo?.installed ? `Claude Code CLI (${claudeInfo.version || "Installed"})` : "Claude Code CLI Pro Companion"}
        >
          <span>Claude Pro</span>
          <Sparkles size={11} className="claude-star-icon" />
        </button>

        <div className="statusbar-item" style={{ gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          <span>Errors: 0</span>
          <span>Warnings: 1</span>
        </div>
      </div>
    </footer>
  );
};
