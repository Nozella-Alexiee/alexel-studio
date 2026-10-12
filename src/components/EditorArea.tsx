import React, { useEffect, useRef } from "react";
import { EditorTab, ThemeMode } from "../types";
import { detectLanguage } from "../utils/editorLanguage";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { Zap, FolderOpen, Sparkles, ChevronRight } from "lucide-react";

interface EditorAreaProps {
  activeTab?: EditorTab;
  theme: ThemeMode;
  onContentChange: (tabId: string, newContent: string) => void;
  onCursorChange: (tabId: string, line: number, col: number) => void;
  onSave: () => void;
  onOpenFolder: () => void;
  onToggleClaude: () => void;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  activeTab,
  theme,
  onContentChange,
  onCursorChange,
  onSave,
  onOpenFolder,
  onToggleClaude,
}) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const languageCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());

  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Initialize CodeMirror view
  useEffect(() => {
    if (!editorContainerRef.current || !activeTab) {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      return;
    }

    const langInfo = detectLanguage(activeTab.name);

    const saveKeybinding = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSaveRef.current();
          return true;
        },
      },
      indentWithTab,
      ...searchKeymap,
    ]);

    const themeExt = theme === "dark" ? oneDark : [];

    const state = EditorState.create({
      doc: activeTab.content,
      extensions: [
        basicSetup,
        saveKeybinding,
        languageCompartmentRef.current.of(langInfo.extension),
        themeCompartmentRef.current.of(themeExt),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            onContentChangeRef.current(activeTab.id, newContent);
          }

          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            const lineObj = update.state.doc.lineAt(pos);
            const line = lineObj.number;
            const col = pos - lineObj.from + 1;
            onCursorChangeRef.current(activeTab.id, line, col);
          }
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13.5px",
            fontFamily: "var(--font-mono)",
            backgroundColor: "transparent",
          },
          ".cm-content": {
            caretColor: "var(--accent-color)",
            padding: "8px 0",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            borderRight: "none",
            color: "var(--text-muted)",
            paddingRight: "8px",
          },
          ".cm-activeLine": {
            backgroundColor: "rgba(56, 189, 248, 0.16) !important",
            borderLeft: "3px solid #38bdf8",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "rgba(56, 189, 248, 0.2) !important",
            color: "#38bdf8 !important",
            fontWeight: "700",
          },
        }),
      ],
    });

    if (editorViewRef.current) {
      editorViewRef.current.destroy();
    }

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [activeTab?.id]);

  useEffect(() => {
    if (!editorViewRef.current) return;
    editorViewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        theme === "dark" ? oneDark : []
      ),
    });
  }, [theme]);

  // Welcome state if no tab is open
  if (!activeTab) {
    return (
      <div className="app-editor-area welcome-center">
        <div style={{ maxWidth: 420 }}>
          <div className="welcome-glow-icon">
            <Zap size={28} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)", marginBottom: 8 }}>
            Nozel Code
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>
            Editor kode desktop ultra-ringan macOS Apple Silicon dengan pendamping Claude Pro CLI.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn-primary" onClick={onOpenFolder}>
              <FolderOpen size={14} />
              Buka Folder
            </button>
            <button className="btn-secondary" onClick={onToggleClaude}>
              <Sparkles size={14} color="var(--accent-color)" />
              Claude Code Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Parse path breadcrumbs like mockup: Nozel Code > src > app > index.tsx
  const pathParts = activeTab.path.split("/").filter(Boolean);
  const displayParts = pathParts.length > 3 ? pathParts.slice(-3) : pathParts;

  // Generate minimap line representations
  const codeLines = activeTab.content.split("\n").slice(0, 45);

  return (
    <div className="app-editor-area">
      {/* 1. Breadcrumbs Bar (Exact from Mockup) */}
      <div className="editor-breadcrumbs-bar">
        <span className="breadcrumb-root">Nozel Code</span>
        <ChevronRight size={12} className="breadcrumb-arrow" />
        {displayParts.slice(0, -1).map((part, idx) => (
          <React.Fragment key={idx}>
            <span className="breadcrumb-dir">{part}</span>
            <ChevronRight size={12} className="breadcrumb-arrow" />
          </React.Fragment>
        ))}
        <span className="breadcrumb-active-file">
          <span style={{ color: "#38bdf8", marginRight: 4 }}>⚛</span>
          {activeTab.name}
        </span>
      </div>

      {/* 2. Main Editor Split with Minimap on Right */}
      <div className="editor-split-layout">
        <div className="editor-code-container" ref={editorContainerRef} />

        {/* Code Minimap (Exact from Mockup on the right) */}
        <aside className="editor-minimap-strip" aria-hidden="true">
          <div className="minimap-viewport-slider" />
          <div className="minimap-code-lines">
            {codeLines.map((line, idx) => {
              const len = Math.min(Math.max(line.trim().length * 2.2, 8), 90);
              const isComment = line.trim().startsWith("//");
              const isImport = line.trim().startsWith("import") || line.trim().startsWith("export");
              const isSpecial = line.trim().startsWith("return") || line.trim().startsWith("const");

              let color = "rgba(255, 255, 255, 0.22)";
              if (isComment) color = "rgba(100, 116, 139, 0.5)";
              else if (isImport) color = "rgba(244, 63, 94, 0.6)";
              else if (isSpecial) color = "rgba(56, 189, 248, 0.6)";

              return (
                <div
                  key={idx}
                  className="minimap-line"
                  style={{
                    width: `${len}%`,
                    backgroundColor: color,
                  }}
                />
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
};
