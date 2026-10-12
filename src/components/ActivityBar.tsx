import React from "react";
import {
  Folder,
  Search,
  Sparkles,
  GitBranch,
  Settings,
  Sun,
  Moon,
  ShieldCheck,
  Hexagon,
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
        {/* 1. Quantum Hexagon 'N' Cyber Brand Logo */}
        <div className="cyber-brand-logo" title="NOZEL // QUANTUM CORE">
          <div className="hex-outer">
            <Hexagon size={28} className="hex-svg" />
            <span className="hex-n">N</span>
          </div>
        </div>

        {/* 2. File HUD Explorer (Active Laser Strip) */}
        <button
          className={`cyber-activity-btn btn-explorer ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => onSelectTab("explorer")}
          title="File Matrix (Cmd+Shift+E)"
        >
          <Folder size={17} strokeWidth={2} className="btn-icon-explorer" />
          {activeTab === "explorer" && <div className="cyber-laser-strip laser-blue" />}
        </button>

        {/* 3. Neural Search */}
        <button
          className={`cyber-activity-btn btn-search ${activeTab === "search" ? "active" : ""}`}
          onClick={() => onSelectTab("search")}
          title="Neural Code Search (Cmd+Shift+F)"
        >
          <Search size={17} strokeWidth={2} className="btn-icon-search" />
          {activeTab === "search" && <div className="cyber-laser-strip laser-purple" />}
        </button>

        {/* 4. Git Quantum Diff */}
        <button
          className={`cyber-activity-btn btn-git ${activeTab === "git" ? "active" : ""}`}
          onClick={() => onSelectTab("git")}
          title="Quantum Source Control"
        >
          <GitBranch size={17} strokeWidth={2} className="btn-icon-git" />
          {activeTab === "git" && <div className="cyber-laser-strip laser-orange" />}
        </button>

        {/* 5. Holographic Neural Claude AI Pill Button */}
        <button
          className={`cyber-claude-pill ${isClaudeOpen ? "active-open" : ""}`}
          onClick={onToggleClaude}
          title="Claude Neural Companion Hub (Claude Pro CLI)"
        >
          <div className="claude-pill-glow" />
          <Sparkles size={14} className="claude-quantum-icon" />
          <span className="claude-pill-text">AI</span>
        </button>
      </div>

      <div className="activitybar-bottom">
        {/* Theme Matrix Switcher */}
        <button
          className="cyber-activity-btn btn-theme"
          onClick={onToggleTheme}
          title={`Switch Environment (${theme === "dark" ? "Neo-Tokyo Lab Light" : "Tokyo Night Rainbow"})`}
        >
          {theme === "dark" ? (
            <Sun size={16} className="btn-icon-sun" />
          ) : (
            <Moon size={16} className="btn-icon-moon" />
          )}
        </button>

        {/* User Identity Hologram */}
        <button
          className="cyber-activity-btn btn-shield"
          title="User Auth: Root / M1 Developer"
        >
          <ShieldCheck size={16} className="btn-icon-shield" />
        </button>

        {/* Settings Engine */}
        <button
          className={`cyber-activity-btn btn-settings ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
          title="System Configuration"
        >
          <Settings size={16} className="btn-icon-settings" />
          {activeTab === "settings" && <div className="cyber-laser-strip laser-cyan" />}
        </button>
      </div>
    </nav>
  );
};
