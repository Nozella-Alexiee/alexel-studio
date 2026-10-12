import React, { useEffect, useRef } from "react";
import { EditorTab, ThemeMode } from "../types";
import { detectLanguage } from "../utils/editorLanguage";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { Zap, FolderOpen, Save, Sparkles } from "lucide-react";

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

  // Keep callback references fresh without recreating editor view
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Initialize or update CodeMirror view when active tab changes
  useEffect(() => {
    if (!editorContainerRef.current || !activeTab) {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      return;
    }

    const langInfo = detectLanguage(activeTab.name);

    // Custom save keybinding
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

    // Theme extension
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
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            backgroundColor: "transparent",
          },
          ".cm-content": {
            caretColor: "var(--accent-color)",
          },
          ".cm-gutters": {
            backgroundColor: "var(--bg-editor)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
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

  // Update theme dynamically
  useEffect(() => {
    if (!editorViewRef.current) return;
    editorViewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        theme === "dark" ? oneDark : []
      ),
    });
  }, [theme]);

  // If no tab is open, show modern welcome screen
  if (!activeTab) {
    return (
      <div
        className="app-editor-area"
        style={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "32px",
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              boxShadow: "0 8px 24px rgba(59, 130, 246, 0.3)",
            }}
          >
            <Zap size={28} color="#ffffff" />
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-main)", marginBottom: 8 }}>
            Nozel Code
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>
            Fast, native, ultra-light code editor built for macOS Apple Silicon.
            Integrated with Claude Code CLI (Claude Pro/Max) with zero memory bloat.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "var(--bg-surface)",
              borderRadius: 8,
              padding: 16,
              border: "1px solid var(--border-subtle)",
              textAlign: "left",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Open Project Folder</span>
              <kbd style={{ background: "var(--bg-editor)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)" }}>
                Cmd + O
              </kbd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Save Active File</span>
              <kbd style={{ background: "var(--bg-editor)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)" }}>
                Cmd + S
              </kbd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Search in Code</span>
              <kbd style={{ background: "var(--bg-editor)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)" }}>
                Cmd + F
              </kbd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Claude Code CLI Companion</span>
              <kbd style={{ background: "var(--bg-editor)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)" }}>
                Top Right Sparkle
              </kbd>
            </div>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn-primary" onClick={onOpenFolder}>
              <FolderOpen size={14} />
              Open Folder
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

  const langInfo = detectLanguage(activeTab.name);

  return (
    <div className="app-editor-area">
      <div className="editor-breadcrumb">
        <div className="breadcrumb-path" title={activeTab.path}>
          <span>{activeTab.path}</span>
          {activeTab.isDirty && (
            <span style={{ color: "var(--dirty-indicator)", fontWeight: 600 }}>
              (Unsaved)
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {langInfo.name}
          </span>
          {activeTab.isDirty && (
            <button
              className="btn-primary"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={onSave}
              title="Save File (Cmd+S)"
            >
              <Save size={12} />
              Save
            </button>
          )}
        </div>
      </div>

      <div className="editor-code-container" ref={editorContainerRef} />
    </div>
  );
};
