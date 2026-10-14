import React from "react";
import { ClaudeCliInfo, EditorTab, SystemFootprint, GitStatus } from "../types";
import { Sparkles, GitBranch, AlertCircle, AlertTriangle, Cpu, Zap } from "lucide-react";

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
    <footer className="vscode-statusbar" role="contentinfo" aria-label="Status Bar">
      {/* Left: Branch & Problems Counter */}
      <div className="vscode-status-left">
        {/* Git Branch */}
        <div
          className="vscode-status-item vscode-branch-item"
          onClick={onToggleGit}
          title={`Git: ${gitStatus?.branch || "main"} (${autoPushEnabled ? "Auto-Push ON" : "Manual"}) — Click to view Source Control`}
        >
          <GitBranch size={12} />
          <span>{gitStatus?.branch || "main"}*</span>
          {autoPushEnabled && (
            <span className="vscode-status-autopush" title="Auto Git Push on Cmd+S">
              <Zap size={10} />
            </span>
          )}
        </div>

        {/* Real-time Problems Counter: ⊗ 2  ⚠ 0 */}
        <div
          className="vscode-status-item vscode-status-problems"
          onClick={onToggleProblems}
          title={`Click to toggle Problems panel (${errorCount} errors, ${warningCount} warnings)`}
        >
          <span className="vscode-status-error-group">
            <AlertCircle size={11} />
            <span>{errorCount}</span>
          </span>
          <span className="vscode-status-warn-group">
            <AlertTriangle size={11} />
            <span>{warningCount}</span>
          </span>
        </div>

        {/* Live Syntax Engine Badge */}
        <div
          className="vscode-status-item vscode-status-engine"
          title="Lezer AST Real-time Syntax Parser active (50ms typing delay)"
        >
          <span>⚡ Real-time Linter</span>
        </div>
      </div>

      {/* Right: Position, Encoding, Language, Memory */}
      <div className="vscode-status-right">
        <div className="vscode-status-item" title="Current Cursor Line and Column">
          <span>Ln {activeTab?.line || 1}, Col {activeTab?.col || 1}</span>
        </div>

        <div className="vscode-status-item" title="Indentation: Spaces: 2">
          <span>Spaces: 2</span>
        </div>

        <div className="vscode-status-item" title="File Encoding: UTF-8">
          <span>UTF-8</span>
        </div>

        <div className="vscode-status-item vscode-status-lang" title="Current Language Mode">
          <span>
            {activeTab?.language
              ? activeTab.language.toUpperCase()
              : "PLAINTEXT"}
          </span>
        </div>

        {/* Ultra-lightweight RAM Memory Tag */}
        <div
          className="vscode-status-item vscode-status-ram"
          title={`Native Apple Silicon RAM Footprint: ${
            footprint ? `${Math.round(footprint.app_memory_mb)} MB` : "38 MB"
          } (Zero Bloat)`}
        >
          <Cpu size={11} />
          <span>{footprint ? `${Math.round(footprint.app_memory_mb)} MB` : "38 MB"}</span>
        </div>

        {/* Claude Pro Companion */}
        <button
          className="vscode-status-claude-btn"
          onClick={onToggleClaude}
          title={
            claudeInfo?.installed
              ? `Claude Pro CLI (${claudeInfo.version || "Active"})`
              : "Launch Claude Companion Drawer"
          }
        >
          <Sparkles size={11} />
          <span>Claude Pro</span>
        </button>
      </div>
    </footer>
  );
};

export default StatusBar;
