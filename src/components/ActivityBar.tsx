import React from "react";
import {
  Folder,
  Search,
  Sparkles,
  Settings,
  Sun,
  Moon,
  User,
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
        {/* 1. Neon Cyan 'N' Brand Logo at the top (from Glass Mockup) */}
        <div className="activitybar-brand-logo" title="Nozel Code">
          <span>N</span>
        </div>

        {/* 2. Folder Explorer (active with left cyan strip) */}
        <button
          className={`activity-btn ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => onSelectTab("explorer")}
          title="Explorer (Cmd+Shift+E)"
        >
          <Folder size={20} strokeWidth={1.8} />
          {activeTab === "explorer" && <div className="activity-active-strip" />}
        </button>

        {/* 3. Search */}
        <button
          className={`activity-btn ${activeTab === "search" ? "active" : ""}`}
          onClick={() => onSelectTab("search")}
          title="Search (Cmd+Shift+F)"
        >
          <Search size={19} strokeWidth={1.8} />
          {activeTab === "search" && <div className="activity-active-strip" />}
        </button>

        {/* 4. Elegant Glowing Claude Tab Button (Exact from Glass Mockup) */}
        <button
          className={`claude-pill-btn ${isClaudeOpen ? "open" : ""}`}
          onClick={onToggleClaude}
          title="Claude Code CLI Companion"
        >
          <Sparkles size={16} className="claude-star-icon" />
          <span className="claude-pill-label">Claude</span>
        </button>
      </div>

      <div className="activitybar-bottom">
        {/* Theme Switcher */}
        <button
          className="activity-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
        >
          {theme === "dark" ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
        </button>

        {/* User Account / Profile Avatar (from Glass Mockup) */}
        <button
          className="activity-btn"
          title="User Account"
        >
          <User size={18} strokeWidth={1.8} />
        </button>

        {/* Settings Gear (from Glass Mockup) */}
        <button
          className={`activity-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
          title="Settings"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>
    </nav>
  );
};
