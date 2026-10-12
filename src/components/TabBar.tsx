import React from "react";
import { EditorTab } from "../types";
import { X, FileText } from "lucide-react";

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

  return (
    <div className="editor-tabs-bar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            className={`editor-tab ${isActive ? "active" : ""}`}
            onClick={() => onSelectTab(tab.id)}
            onMouseDown={(e) => {
              // Middle click to close tab
              if (e.button === 1) {
                e.preventDefault();
                onCloseTab(tab.id, e);
              }
            }}
            title={tab.path}
          >
            <FileText size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span className="tab-name">{tab.name}</span>

            {tab.isDirty && (
              <span
                className="tab-dirty-indicator"
                title="Unsaved changes"
              />
            )}

            <button
              className="tab-close-btn"
              onClick={(e) => onCloseTab(tab.id, e)}
              title="Close Tab"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
