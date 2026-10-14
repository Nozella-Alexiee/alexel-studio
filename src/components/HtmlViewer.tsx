import React from "react";
import { Columns2, Code2, Eye, ExternalLink } from "lucide-react";

interface HtmlViewerProps {
  content: string;
  mode: "code" | "split" | "preview";
  onModeChange: (mode: "code" | "split" | "preview") => void;
  editorElement?: React.ReactNode;
  onOpenInBrowser?: () => void;
}

export const HtmlViewer: React.FC<HtmlViewerProps> = ({
  content,
  mode,
  onModeChange,
  editorElement,
  onOpenInBrowser,
}) => {
  return (
    <div className="markdown-viewer-layout html-viewer-layout">
      {/* HTML Mode Control Toolbar */}
      <div className="markdown-toolbar html-toolbar">
        <div className="flex items-center gap-2">
          <span className="markdown-toolbar-label">HTML5 Live Web Preview</span>
          {onOpenInBrowser && (
            <button
              className="vscode-btn-open-browser"
              onClick={onOpenInBrowser}
              title="Open in Default System Browser (⌘R / F5)"
            >
              <ExternalLink size={12} />
              <span>Open in Browser</span>
            </button>
          )}
        </div>
        <div className="markdown-mode-segmented">
          <button
            className={`markdown-mode-btn ${mode === "code" ? "active" : ""}`}
            onClick={() => onModeChange("code")}
            title="Code Editor Only"
          >
            <Code2 size={12} />
            <span>Code</span>
          </button>
          <button
            className={`markdown-mode-btn ${mode === "split" ? "active" : ""}`}
            onClick={() => onModeChange("split")}
            title="Split Code & Live Browser Preview"
          >
            <Columns2 size={12} />
            <span>Split</span>
          </button>
          <button
            className={`markdown-mode-btn ${mode === "preview" ? "active" : ""}`}
            onClick={() => onModeChange("preview")}
            title="Live Browser Preview Only"
          >
            <Eye size={12} />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Main Split or Single Area */}
      <div className={`markdown-body-container mode-${mode}`}>
        {mode !== "preview" && (
          <div className="markdown-editor-pane">{editorElement}</div>
        )}

        {mode !== "code" && (
          <div className="markdown-preview-pane html-preview-pane">
            <iframe
              className="html-live-iframe"
              title="HTML Live Web Preview"
              srcDoc={content}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default HtmlViewer;
