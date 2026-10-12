import React from "react";
import { ClaudeCliInfo, EditorTab, SystemFootprint } from "../types";
import { Sparkles, Cpu, CheckCircle2, AlertCircle } from "lucide-react";

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
    <footer className="app-statusbar">
      <div className="statusbar-section">
        {activeTab ? (
          <>
            <div className="statusbar-item">
              <span>Ln {activeTab.line}, Col {activeTab.col}</span>
            </div>
            <div className="statusbar-item">
              <span>UTF-8</span>
            </div>
            <div className="statusbar-item">
              <span>{activeTab.language}</span>
            </div>
            {activeTab.isDirty && (
              <div className="statusbar-item" style={{ color: "var(--dirty-indicator)" }}>
                <span>● Modified</span>
              </div>
            )}
          </>
        ) : (
          <div className="statusbar-item">
            <span>Ready</span>
          </div>
        )}
      </div>

      <div className="statusbar-section">
        {footprint && (
          <div
            className="statusbar-item"
            title={`Nozel Code RAM: ${footprint.app_memory_mb} MB. VS Code baseline: ${footprint.vscode_baseline_mb} MB (${footprint.savings_percentage}% lower memory footprint).`}
          >
            <Cpu size={12} color="var(--accent-color)" />
            <span>{footprint.app_memory_mb} MB RAM ({footprint.savings_percentage}% vs VS Code)</span>
          </div>
        )}

        <button
          className="statusbar-btn"
          onClick={onToggleClaude}
          title="Claude Code CLI Pro status and options"
        >
          <Sparkles size={12} color={claudeInfo?.installed ? "var(--success-color)" : "var(--text-muted)"} />
          <span>
            Claude Code:{" "}
            {claudeInfo?.installed ? (
              <span style={{ color: "var(--success-color)" }}>CLI Connected (Pro)</span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>Not Detected</span>
            )}
          </span>
          {claudeInfo?.installed ? (
            <CheckCircle2 size={11} color="var(--success-color)" />
          ) : (
            <AlertCircle size={11} color="var(--text-muted)" />
          )}
        </button>
      </div>
    </footer>
  );
};
