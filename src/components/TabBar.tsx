import React from "react";
import { EditorTab } from "../types";
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
    const ext = tab.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "tsx":
        return <span className="tab-glass-badge react-badge">⚛</span>;
      case "ts":
        return <span className="tab-glass-badge ts-badge">TS</span>;
      case "rs":
        return <span className="tab-glass-badge rs-badge">🦀</span>;
      case "md":
        return <span className="tab-glass-badge md-badge">ℹ</span>;
      case "json":
        return <span className="tab-glass-badge json-badge">&#123;.&#125;</span>;
      default:
        return <span className="tab-glass-badge txt-badge">📄</span>;
    }
  };

  return (
    <div className="floating-pill-tabbar">
      <div className="pill-tabs-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              className={`pill-tab-item ${isActive ? "active-glass" : ""}`}
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
              <span className="pill-tab-name">{tab.name}</span>

              {/* Glowing cyan dot for active tab or modified indicator */}
              {(isActive || tab.isDirty) && (
                <span className="pill-tab-dot-cyan" title="Active File" />
              )}

              <button
                className="pill-tab-close"
                onClick={(e) => onCloseTab(tab.id, e)}
                title="Tutup Tab"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Action Controls on the Right (Split, More) from Glass Mockup */}
      <div className="tabbar-right-controls">
        <button className="tab-control-btn" title="Split Editor Right">
          <Columns2 size={13} />
        </button>
        <button className="tab-control-btn" title="More Actions">
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
};
