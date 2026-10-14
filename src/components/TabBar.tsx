import React from "react";
import { EditorTab } from "../types";
import { FileIcon } from "./FileIcon";
import { X, Columns2, MoreHorizontal, Play } from "lucide-react";

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e: React.MouseEvent) => void;
  onRunCode?: () => void;
  isRunning?: boolean;
}


export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onRunCode,
  isRunning,
}) => {
  if (tabs.length === 0) {
    return null;
  }

  const getTabBadge = (tab: EditorTab) => {
    return <FileIcon filename={tab.name} size={14} />;
  };

  return (
    <div className="vscode-tabbar cyber-tabbar">
      <div className="vscode-tabs-track cyber-tabs-track">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              className={`vscode-tab-item cyber-tab-item ${isActive ? "active active-laser" : ""}`}
              onClick={() => onSelectTab(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id, e);
                }
              }}
              title={tab.path}
            >
              <span className="vscode-tab-icon">{getTabBadge(tab)}</span>
              <span className="vscode-tab-title cyber-tab-title">{tab.name}</span>

              {/* Dot for active or modified file */}
              {tab.isDirty ? (
                <span className="vscode-tab-dirty-dot cyber-tab-dot dirty" title="Unsaved changes" />
              ) : null}

              <button
                className="vscode-tab-close cyber-tab-close"
                onClick={(e) => onCloseTab(tab.id, e)}
                title="Close (⌘W)"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Viewport & Editor Controls */}
      <div className="vscode-tabbar-tools cyber-tabbar-tools">
        {onRunCode && (
          <button
            className={`vscode-btn-run-code ${isRunning ? "running" : ""}`}
            onClick={onRunCode}
            disabled={isRunning}
            title="Run Active File (⌘R / F5)"
          >
            <Play size={12} fill="currentColor" />
            <span>{isRunning ? "Running..." : "Run"}</span>
          </button>
        )}
        <button className="vscode-tool-btn cyber-tool-btn" title="Split Editor Right (⌘\)">
          <Columns2 size={13} />
        </button>
        <button className="vscode-tool-btn cyber-tool-btn" title="More Actions">
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  );
};


export default TabBar;
