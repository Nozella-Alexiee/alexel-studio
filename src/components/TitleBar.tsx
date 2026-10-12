import React from "react";
import { ThemeMode, SystemFootprint } from "../types";
import { PanelLeft, PanelBottom, PanelRight, Sparkles } from "lucide-react";

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
  onToggleClaudePanel,
}) => {
  const displayTitle = activeFileName
    ? `${activeFileName} — ${projectName || "Nozel Code"}`
    : projectName
    ? `${projectName} — Nozel Code`
    : "Nozel Code";

  return (
    <header className="app-titlebar-cyber">
      {/* 1. macOS Traffic Lights on top left */}
      <div className="titlebar-traffic-lights" aria-hidden="true">
        <span className="traffic-dot dot-close" />
        <span className="traffic-dot dot-minimize" />
        <span className="traffic-dot dot-maximize" />
      </div>

      {/* 2. Authentic Clean Center Title */}
      <div className="titlebar-center-title">
        <span className="pro-app-brand">Nozel</span>
        <span className="cyber-file-title">{displayTitle}</span>
      </div>

      {/* 3. Window Layout Controls */}
      <div className="titlebar-window-controls" aria-hidden="true">
        <button className="win-layout-icon" title="Toggle Sidebar (⌘B)">
          <PanelLeft size={13} />
        </button>
        <button className="win-layout-icon" title="Toggle Problems Panel">
          <PanelBottom size={13} />
        </button>
        <button
          className="win-layout-icon highlight-ai"
          title="Toggle Claude Pro Assistant"
          onClick={onToggleClaudePanel}
        >
          <Sparkles size={12} className="mr-0.5 text-sky-400" />
          <PanelRight size={13} />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
