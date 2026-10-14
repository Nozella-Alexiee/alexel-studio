import React from "react";
import {
  Files,
  Search,
  Sparkles,
  GitBranch,
  Settings,
  Sun,
  Moon,
  AlertCircle,
} from "lucide-react";
import { ThemeMode } from "../types";

export type ActivityTab = "explorer" | "search" | "git" | "problems" | "claude" | "settings";

interface ActivityBarProps {
  activeTab: ActivityTab;
  onSelectTab: (tab: ActivityTab) => void;
  isClaudeOpen: boolean;
  onToggleClaude: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  errorCount?: number;
  warningCount?: number;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onSelectTab,
  isClaudeOpen,
  onToggleClaude,
  theme,
  onToggleTheme,
  errorCount = 0,
  warningCount = 0,
}) => {
  const totalProblems = errorCount + warningCount;

  return (
    <nav className="vscode-activity-bar" aria-label="Activity Bar">
      <div className="vscode-activity-top">
        {/* 1. File Explorer */}
        <button
          className={`vscode-activity-icon ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => onSelectTab("explorer")}
          title="Explorer (⌘⇧E)"
          aria-label="Explorer"
        >
          <Files size={22} strokeWidth={1.7} />
        </button>

        {/* 2. Search */}
        <button
          className={`vscode-activity-icon ${activeTab === "search" ? "active" : ""}`}
          onClick={() => onSelectTab("search")}
          title="Search (⌘⇧F)"
          aria-label="Search"
        >
          <Search size={22} strokeWidth={1.7} />
        </button>

        {/* 3. Source Control */}
        <button
          className={`vscode-activity-icon ${activeTab === "git" ? "active" : ""}`}
          onClick={() => onSelectTab("git")}
          title="Source Control (⌃⇧G)"
          aria-label="Source Control"
        >
          <GitBranch size={22} strokeWidth={1.7} />
        </button>

        {/* 4. Problems & Error Diagnostics (Live Real-time Counter Badge) */}
        <button
          className={`vscode-activity-icon ${activeTab === "problems" ? "active" : ""}`}
          onClick={() => onSelectTab("problems")}
          title={`Problems & Syntax Linter (⌘⇧M) — ${errorCount} errors, ${warningCount} warnings`}
          aria-label="Problems Panel"
        >
          <AlertCircle size={22} strokeWidth={1.7} />
          {totalProblems > 0 && (
            <span
              className="vscode-badge-counter"
              title={`${errorCount} error(s), ${warningCount} warning(s)`}
            >
              {totalProblems > 99 ? "99+" : totalProblems}
            </span>
          )}
        </button>

        {/* 5. Claude Companion Pill */}
        <button
          className={`vscode-claude-btn ${isClaudeOpen ? "active" : ""}`}
          onClick={onToggleClaude}
          title="Claude Pro Companion CLI"
          aria-label="Claude AI"
        >
          <Sparkles size={16} />
        </button>
      </div>

      <div className="vscode-activity-bottom">
        {/* Theme Switcher */}
        <button
          className="vscode-activity-icon"
          onClick={onToggleTheme}
          title={`Toggle Color Theme (${theme === "dark" ? "VS Code Light" : "VS Code Dark+"})`}
          aria-label="Switch Theme"
        >
          {theme === "dark" ? (
            <Sun size={20} strokeWidth={1.7} />
          ) : (
            <Moon size={20} strokeWidth={1.7} />
          )}
        </button>

        {/* Settings */}
        <button
          className={`vscode-activity-icon ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          <Settings size={20} strokeWidth={1.7} />
        </button>
      </div>
    </nav>
  );
};

export default ActivityBar;
