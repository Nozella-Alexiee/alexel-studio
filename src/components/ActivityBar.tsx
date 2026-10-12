import React from "react";
import {
  Folder,
  Search,
  Sparkles,
  GitBranch,
  Settings,
  Sun,
  Moon,
  AlertTriangle,
  Hexagon,
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
    <nav className="app-activitybar" aria-label="Activity Bar">
      <div className="activitybar-top">
        {/* Apple Studio Brand Logo */}
        <div className="cyber-brand-logo" title="Nozel Code // Apple Silicon M1">
          <div className="hex-outer">
            <Hexagon size={28} className="hex-svg" />
            <span className="hex-n">N</span>
          </div>
        </div>

        {/* 1. File Explorer */}
        <button
          className={`cyber-activity-btn btn-explorer ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => onSelectTab("explorer")}
          title="File Explorer (Cmd+Shift+E)"
        >
          <Folder size={18} strokeWidth={1.8} className="btn-icon-explorer" />
          {activeTab === "explorer" && <div className="cyber-laser-strip" />}
        </button>

        {/* 2. Source Control & Git Auto-Bot */}
        <button
          className={`cyber-activity-btn btn-git ${activeTab === "git" ? "active" : ""}`}
          onClick={() => onSelectTab("git")}
          title="Git Bot & Source Control (Cmd+Shift+G)"
        >
          <GitBranch size={18} strokeWidth={1.8} className="btn-icon-git" />
          {activeTab === "git" && <div className="cyber-laser-strip" />}
        </button>

        {/* 3. Problems & Linter Panel */}
        <button
          className={`cyber-activity-btn btn-problems ${activeTab === "problems" ? "active" : ""}`}
          onClick={() => onSelectTab("problems")}
          title={`Code Problems & Diagnostics (${totalProblems} issues)`}
        >
          <AlertTriangle size={18} strokeWidth={1.8} className="btn-icon-problems" />
          {totalProblems > 0 && (
            <span className="activity-badge" title={`${errorCount} errors, ${warningCount} warnings`}>
              {totalProblems > 99 ? "99+" : totalProblems}
            </span>
          )}
          {activeTab === "problems" && <div className="cyber-laser-strip" />}
        </button>

        {/* 4. Search */}
        <button
          className={`cyber-activity-btn btn-search ${activeTab === "search" ? "active" : ""}`}
          onClick={() => onSelectTab("search")}
          title="Search in Files (Cmd+Shift+F)"
        >
          <Search size={18} strokeWidth={1.8} className="btn-icon-search" />
          {activeTab === "search" && <div className="cyber-laser-strip" />}
        </button>

        {/* 5. Claude Companion Pill */}
        <button
          className={`cyber-claude-pill ${isClaudeOpen ? "active-open" : ""}`}
          onClick={onToggleClaude}
          title="Claude Companion Drawer (Claude Code Pro CLI)"
        >
          <Sparkles size={14} className="claude-quantum-icon" />
          <span className="claude-pill-text">AI</span>
        </button>
      </div>

      <div className="activitybar-bottom">
        {/* Theme Switcher */}
        <button
          className="cyber-activity-btn btn-theme"
          onClick={onToggleTheme}
          title={`Switch Theme (${theme === "dark" ? "Apple Studio Pro Light" : "Apple Studio Pro Dark"})`}
        >
          {theme === "dark" ? (
            <Sun size={17} className="btn-icon-sun" />
          ) : (
            <Moon size={17} className="btn-icon-moon" />
          )}
        </button>

        {/* Settings */}
        <button
          className={`cyber-activity-btn btn-settings ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
          title="Settings (Cmd+,)"
        >
          <Settings size={17} className="btn-icon-settings" />
          {activeTab === "settings" && <div className="cyber-laser-strip" />}
        </button>
      </div>
    </nav>
  );
};
export default ActivityBar;
