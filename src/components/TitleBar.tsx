import React from "react";
import { ThemeMode, SystemFootprint } from "../types";
import { PanelLeft, PanelBottom, PanelRight, Columns2 } from "lucide-react";

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
    ? `Nozel Code - app/${activeFileName}`
    : projectName
    ? `Nozel Code - ${projectName}`
    : "Nozel Code";

  return (
    <header className="app-titlebar-mockup">
      {/* 1. macOS Traffic Lights (Red, Yellow, Green) on top left */}
      <div className="titlebar-traffic-lights" aria-hidden="true">
        <span className="traffic-dot dot-close" />
        <span className="traffic-dot dot-minimize" />
        <span className="traffic-dot dot-maximize" />
      </div>

      {/* 2. Centered Title (Exact from Glass Mockup: Nozel Code - app/index.tsx) */}
      <div className="titlebar-center-title">
        <span>{displayTitle}</span>
      </div>

      {/* 3. macOS Window Layout Icons on top right (Exact from Glass Mockup) */}
      <div className="titlebar-window-controls" aria-hidden="true">
        <button className="win-layout-icon" title="Toggle Primary Sidebar">
          <PanelLeft size={13} />
        </button>
        <button className="win-layout-icon" title="Toggle Bottom Panel">
          <PanelBottom size={13} />
        </button>
        <button className="win-layout-icon" title="Split Editor Right">
          <Columns2 size={13} />
        </button>
        <button
          className="win-layout-icon"
          title="Toggle Claude AI Companion"
          onClick={onToggleClaudePanel}
        >
          <PanelRight size={13} />
        </button>
      </div>
    </header>
  );
};
