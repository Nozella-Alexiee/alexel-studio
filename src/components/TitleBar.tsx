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
  onToggleProblemsPanel?: () => void;
  footprint?: SystemFootprint;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  projectName,
  activeFileName,
  onToggleClaudePanel,
  onToggleProblemsPanel,
}) => {
  return (
    <header className="vscode-titlebar" aria-label="Title Bar">
      {/* 1. macOS Native Traffic Lights */}
      <div className="vscode-traffic-lights" aria-hidden="true">
        <span className="vscode-traffic-dot dot-close" />
        <span className="vscode-traffic-dot dot-minimize" />
        <span className="vscode-traffic-dot dot-maximize" />
      </div>

      {/* 2. Authentic VS Code Center Title */}
      <div className="vscode-titlebar-center">
        <span>{projectName || "nozel-project"}</span>
        <span className="vscode-title-sep">—</span>
        <strong>{activeFileName || "Nozel Code"}</strong>
        <span className="vscode-title-sep">—</span>
        <span className="vscode-app-subname">Nozel Code</span>
      </div>

      {/* 3. Window Layout Controls */}
      <div className="vscode-titlebar-actions" aria-hidden="true">
        <button className="vscode-titlebar-btn" title="Toggle Primary Side Bar (⌘B)">
          <PanelLeft size={14} />
        </button>
        <button
          className="vscode-titlebar-btn"
          title="Toggle Bottom Problems Panel (⌘J / ⌘⇧M)"
          onClick={onToggleProblemsPanel}
        >
          <PanelBottom size={14} />
        </button>
        <button
          className="vscode-titlebar-btn vscode-titlebar-ai"
          title="Toggle Claude Pro Assistant"
          onClick={onToggleClaudePanel}
        >
          <Sparkles size={13} className="text-ai" />
          <PanelRight size={14} />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
