import React, { useMemo } from "react";
import { marked } from "marked";
import { Columns2, Code2, Eye } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  mode: "code" | "split" | "preview";
  onModeChange: (mode: "code" | "split" | "preview") => void;
  editorElement?: React.ReactNode;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  mode,
  onModeChange,
  editorElement,
}) => {
  // Synchronous compile markdown to sanitized HTML
  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(content, { async: false, gfm: true, breaks: true }) as string;
    } catch (err) {
      return `<p class="markdown-error">Failed to parse markdown: ${String(err)}</p>`;
    }
  }, [content]);

  return (
    <div className="markdown-viewer-layout">
      {/* Markdown Mode Control Toolbar */}
      <div className="markdown-toolbar">
        <span className="markdown-toolbar-label">Markdown Live Preview</span>
        <div className="markdown-mode-segmented">
          <button
            className={`markdown-mode-btn ${mode === "code" ? "active" : ""}`}
            onClick={() => onModeChange("code")}
            title="Raw Markdown Editor Only"
          >
            <Code2 size={12} />
            <span>Code</span>
          </button>
          <button
            className={`markdown-mode-btn ${mode === "split" ? "active" : ""}`}
            onClick={() => onModeChange("split")}
            title="Split Editor & Live Preview"
          >
            <Columns2 size={12} />
            <span>Split</span>
          </button>
          <button
            className={`markdown-mode-btn ${mode === "preview" ? "active" : ""}`}
            onClick={() => onModeChange("preview")}
            title="Rendered Formatted Preview Only"
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
          <div className="markdown-preview-pane">
            <div
              className="markdown-rendered-content"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
