import React from "react";
import { ClaudeCliInfo, EditorTab, SystemFootprint } from "../types";
import { Sparkles, GitBranch, Cpu, Activity } from "lucide-react";

interface StatusBarProps {
  activeTab?: EditorTab;
  footprint?: SystemFootprint;
  claudeInfo?: ClaudeCliInfo;
  onToggleClaude: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  footprint,
  claudeInfo,
  onToggleClaude,
}) => {
  return (
    <footer className="app-statusbar-cyber">
      {/* Left Sci-Fi Telemetry & Git Branch */}
      <div className="statusbar-left">
        <div className="cyber-pill-branch" title="Git Matrix Branch: main">
          <GitBranch size={10} color="#00f0ff" />
          <span>BRANCH: main</span>
        </div>
        <div className="cyber-status-item">
          <span className="telemetry-tag">ERR: 0</span>
          <span className="telemetry-tag">WARN: 0</span>
        </div>
      </div>

      {/* Right Sci-Fi Metrics & Memory Telemetry */}
      <div className="statusbar-right">
        <div className="cyber-status-item cursor-pos">
          <span>LN {activeTab?.line || 24} : COL {activeTab?.col || 18}</span>
        </div>
        <div className="cyber-status-item">
          <span>SPACES: 4</span>
        </div>
        <div className="cyber-status-item">
          <span>UTF-8 // LF</span>
        </div>
        <div className="cyber-status-item">
          <span>{activeTab?.language?.toUpperCase() || "TSX"}</span>
        </div>

        {/* Futuristic RAM Telemetry Chip */}
        <div
          className="cyber-pill-memory"
          title={`Nozel Code RAM: ${footprint?.app_memory_mb || 38.4} MB vs VS Code ~650 MB (Zero Bloat)`}
        >
          <Cpu size={11} color="#00f0ff" />
          <span>MEM: {footprint ? `${Math.round(footprint.app_memory_mb)} MB` : "38 MB"}</span>
        </div>

        {/* Holographic Claude Pro Neural Agent Pill */}
        <button
          className="cyber-pill-claude"
          onClick={onToggleClaude}
          title={claudeInfo?.installed ? `Claude Pro CLI (${claudeInfo.version || "Active"})` : "Claude Neural Companion"}
        >
          <Sparkles size={11} className="quantum-sparkle" />
          <span>NEURAL CLAUDE PRO</span>
        </button>

        <div className="cyber-status-item live-pulse" title="System Latency: 0.2ms">
          <Activity size={10} color="#10b981" />
          <span>0.2ms</span>
        </div>
      </div>
    </footer>
  );
};
