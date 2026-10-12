import React from "react";
import { EditorTab } from "../types";
import { FileIcon } from "./FileIcon";
import { X, Columns2, MoreHorizontal } from "lucide-react";

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e: React.MouseEvent) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}) => {
  if (tabs.length === 0) {
    return null;
  }

  const getTabBadge = (tab: EditorTab) => {
    return <FileIcon filename={tab.name} size={14} />;
  };

  return (
    <div className="cyber-tabbar">
      <div className="cyber-tabs-track">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              className={`cyber-tab-item ${isActive ? "active-laser" : ""}`}
              onClick={() => onSelectTab(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id, e);
                }
              }}
              title={tab.path}
            >
              {getTabBadge(tab)}
              <span className="cyber-tab-title">{tab.name}</span>

              {/* Dot for active or modified file */}
              {tab.isDirty ? (
                <span className="cyber-tab-dot dirty" title="Unsaved changes" />
              ) : isActive ? (
                <span className="cyber-tab-dot active" />
              ) : null}

              <button
                className="cyber-tab-close"
                onClick={(e) => onCloseTab(tab.id, e)}
                title="Close (⌘W)"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Viewport & Editor Controls */}
      <div className="cyber-tabbar-tools">
        <button className="cyber-tool-btn" title="Split Editor Right">
          <Columns2 size={13} />
        </button>
        <button className="cyber-tool-btn" title="More Actions">
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  );
};

export default TabBar;
