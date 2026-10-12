import React from "react";
import { ClaudeCliInfo, EditorTab, SystemFootprint, GitStatus } from "../types";
import { Sparkles, GitBranch, Cpu, AlertCircle, AlertTriangle, Zap } from "lucide-react";

interface StatusBarProps {
  activeTab?: EditorTab;
  footprint?: SystemFootprint;
  claudeInfo?: ClaudeCliInfo;
  onToggleClaude: () => void;
  errorCount?: number;
  warningCount?: number;
  onToggleProblems?: () => void;
  gitStatus?: GitStatus;
  autoPushEnabled?: boolean;
  onToggleGit?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  footprint,
  claudeInfo,
  onToggleClaude,
  errorCount = 0,
  warningCount = 0,
  onToggleProblems,
  gitStatus,
  autoPushEnabled = false,
  onToggleGit,
}) => {
  return (
    <footer className="app-statusbar-cyber">
      {/* Left: Git Branch & Diagnostics Problems */}
      <div className="statusbar-left">
        {/* Git Branch & Auto Bot Status */}
        <div
          className="cyber-pill-branch"
          onClick={onToggleGit}
          title={`Git Branch: ${gitStatus?.branch || "main"} (${autoPushEnabled ? "Auto Git Bot ON" : "Manual Push"}) - Klik untuk buka Source Control`}
        >
          <GitBranch size={11} className="text-emerald-400" />
          <span>{gitStatus?.branch || "main"}</span>
          {autoPushEnabled && (
            <span className="flex items-center gap-1 text-[9.5px] text-emerald-300 ml-1">
              <Zap size={9} />
              <span>Bot</span>
            </span>
          )}
        </div>

        {/* Problems & Diagnostics Clickable Pill */}
        <div
          className="cyber-status-item clickable"
          onClick={onToggleProblems}
          title="Toggle Problems & Syntax Diagnostics Panel"
        >
          <span className="telemetry-tag err">
            <AlertCircle size={10} />
            <span>{errorCount}</span>
          </span>
          <span className="telemetry-tag warn">
            <AlertTriangle size={10} />
            <span>{warningCount}</span>
          </span>
        </div>
      </div>

      {/* Right: Telemetry, Memory & Claude Companion */}
      <div className="statusbar-right">
        <div className="cyber-status-item cursor-pos">
          <span>Ln {activeTab?.line || 1}, Col {activeTab?.col || 1}</span>
        </div>
        <div className="cyber-status-item spaces-tag">
          <span>Spaces: 2</span>
        </div>
        <div className="cyber-status-item encoding-tag">
          <span>UTF-8</span>
        </div>
        <div className="cyber-status-item lang-tag">
          <span>{activeTab?.language?.toUpperCase() || "PLAINTEXT"}</span>
        </div>

        {/* M1 RAM Telemetry Chip */}
        <div
          className="cyber-pill-memory"
          title={`Nozel Code RAM Footprint: ${footprint ? `${Math.round(footprint.app_memory_mb)} MB` : "38 MB"} vs VS Code ~650 MB`}
        >
          <Cpu size={11} />
          <span>{footprint ? `${Math.round(footprint.app_memory_mb)} MB` : "38 MB"}</span>
        </div>

        {/* Claude Pro Companion Pill */}
        <button
          className="cyber-pill-claude"
          onClick={onToggleClaude}
          title={claudeInfo?.installed ? `Claude Pro CLI (${claudeInfo.version || "Active"})` : "Claude Companion"}
        >
          <Sparkles size={11} />
          <span>Claude Pro</span>
        </button>
      </div>
    </footer>
  );
};

export default StatusBar;
