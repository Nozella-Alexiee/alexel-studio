import React from "react";
import { ThemeMode, SystemFootprint } from "../types";
import { PanelLeft, PanelBottom, PanelRight, Columns2, Activity } from "lucide-react";

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
    ? `NOZEL // app/${activeFileName}`
    : projectName
    ? `NOZEL // ${projectName}`
    : "NOZEL // STUDIO";

  return (
    <header className="app-titlebar-cyber">
      {/* 1. macOS Cyber Traffic Lights on top left */}
      <div className="titlebar-traffic-lights" aria-hidden="true">
        <span className="traffic-dot dot-close" />
        <span className="traffic-dot dot-minimize" />
        <span className="traffic-dot dot-maximize" />
      </div>

      {/* 2. Cyber HUD Monospace Title Bar */}
      <div className="titlebar-center-title">
        <span className="cyber-brand-tag">[NZL_OS]</span>
        <span className="cyber-file-title">{displayTitle}</span>
        <span className="cyber-status-pulse" title="System Link: Active">
          <Activity size={10} className="pulse-icon" />
          SYNC
        </span>
      </div>

      {/* 3. Futuristic HUD Window Layout Icons */}
      <div className="titlebar-window-controls" aria-hidden="true">
        <button className="win-layout-icon" title="Toggle File HUD">
          <PanelLeft size={12} />
        </button>
        <button className="win-layout-icon" title="Toggle Terminal Output">
          <PanelBottom size={12} />
        </button>
        <button className="win-layout-icon" title="Split Cyber Viewport">
          <Columns2 size={12} />
        </button>
        <button
          className="win-layout-icon highlight-ai"
          title="Toggle Neural Claude Agent"
          onClick={onToggleClaudePanel}
        >
          <PanelRight size={12} />
        </button>
      </div>
    </header>
  );
};
