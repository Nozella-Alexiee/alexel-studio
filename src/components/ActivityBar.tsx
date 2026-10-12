import React from "react";
import {
  Files,
  Search,
  Sparkles,
  GitBranch,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { ThemeMode } from "../types";

export type ActivityTab = "explorer" | "search" | "git" | "claude" | "settings";

interface ActivityBarProps {
  activeTab: ActivityTab;
  onSelectTab: (tab: ActivityTab) => void;
  isClaudeOpen: boolean;
  onToggleClaude: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onSelectTab,
  isClaudeOpen,
  onToggleClaude,
  theme,
  onToggleTheme,
}) => {
  return (
    <nav className="app-activitybar" aria-label="Activity Bar">
      <div className="activitybar-top">
        {/* Explorer */}
        <button
          className={`activity-btn ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => onSelectTab("explorer")}
          title="Explorer (Cmd+Shift+E)"
        >
          <Files size={19} />
          {activeTab === "explorer" && <div className="activity-active-indicator" />}
        </button>

        {/* Search */}
        <button
          className={`activity-btn ${activeTab === "search" ? "active" : ""}`}
          onClick={() => onSelectTab("search")}
          title="Search (Cmd+Shift+F)"
        >
          <Search size={19} />
          {activeTab === "search" && <div className="activity-active-indicator" />}
        </button>

        {/* Git */}
        <button
          className={`activity-btn ${activeTab === "git" ? "active" : ""}`}
          onClick={() => onSelectTab("git")}
          title="Source Control"
        >
          <GitBranch size={19} />
          {activeTab === "git" && <div className="activity-active-indicator" />}
        </button>

        {/* Claude Code AI */}
        <button
          className={`activity-btn claude-activity-btn ${isClaudeOpen ? "active" : ""}`}
          onClick={onToggleClaude}
          title="Claude Code Pro Companion Hub"
        >
          <Sparkles size={19} className="claude-sparkle-icon" />
          {isClaudeOpen && <div className="activity-active-indicator claude-indicator" />}
        </button>
      </div>

      <div className="activitybar-bottom">
        {/* Theme Switcher */}
        <button
          className="activity-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Settings */}
        <button
          className={`activity-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
          title="Settings"
        >
          <Settings size={18} />
          {activeTab === "settings" && <div className="activity-active-indicator" />}
        </button>
      </div>
    </nav>
  );
};
