import React, { useEffect, useRef } from "react";
import { EditorTab, ThemeMode } from "../types";
import { detectLanguage } from "../utils/editorLanguage";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { getSyntaxTheme } from "../utils/syntaxTheme";
import { createCodeLinter } from "../utils/codeLinter";
import { createCodeAutocomplete } from "../utils/codeAutocomplete";
import { Cpu, Terminal, Sparkles, ChevronRight } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { CodeProblem } from "../types";

interface EditorAreaProps {
  activeTab?: EditorTab;
  theme: ThemeMode;
  onContentChange: (tabId: string, newContent: string) => void;
  onCursorChange: (tabId: string, line: number, col: number) => void;
  onSave: () => void;
  onOpenFolder: () => void;
  onToggleClaude: () => void;
  onDiagnosticsChange?: (problems: CodeProblem[]) => void;
  jumpToLine?: { line: number; col: number; token: number };
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  activeTab,
  theme,
  onContentChange,
  onCursorChange,
  onSave,
  onOpenFolder,
  onToggleClaude,
  onDiagnosticsChange,
  jumpToLine,
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
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);
  onDiagnosticsChangeRef.current = onDiagnosticsChange;

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

    const themeExt = getSyntaxTheme(theme);

    // 1. Diagnostics / Code Error Tracker
    const linterExt = createCodeLinter(activeTab.name, (diagnostics) => {
      if (!editorViewRef.current || !onDiagnosticsChangeRef.current) return;
      const view = editorViewRef.current;
      const doc = view.state.doc;
      const problems: CodeProblem[] = diagnostics.map((d) => {
        const safeFrom = Math.min(Math.max(d.from, 0), doc.length);
        const lineObj = doc.lineAt(safeFrom);
        return {
          line: lineObj.number,
          col: safeFrom - lineObj.from + 1,
          message: d.message,
          severity: (d.severity as any) || "error",
          source: d.source,
        };
      });
      onDiagnosticsChangeRef.current(problems);
    });

    // 2. Autocomplete & Code Snippets ("Preview Lanjutannya")
    const autocompleteExt = createCodeAutocomplete(activeTab.name);

    const state = EditorState.create({
      doc: activeTab.content,
      extensions: [
        basicSetup,
        saveKeybinding,
        linterExt,
        autocompleteExt,
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
          },
          ".cm-content": {
            padding: "10px 0",
          },
          ".cm-gutters": {
            paddingRight: "10px",
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

  // Jump to line when requested from Problems Panel
  useEffect(() => {
    if (!editorViewRef.current || !jumpToLine) return;
    const view = editorViewRef.current;
    const doc = view.state.doc;
    const targetLine = Math.min(Math.max(jumpToLine.line, 1), doc.lines);
    const lineObj = doc.line(targetLine);
    const targetPos = Math.min(lineObj.from + Math.max(jumpToLine.col - 1, 0), lineObj.to);

    view.dispatch({
      selection: { anchor: targetPos, head: targetPos },
      scrollIntoView: true,
    });
    view.focus();
  }, [jumpToLine]);

  useEffect(() => {
    if (!editorViewRef.current) return;
    editorViewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(getSyntaxTheme(theme)),
    });
  }, [theme]);

  // Welcome state if no tab is open
  if (!activeTab) {
    return (
      <div className="app-editor-area cyber-welcome">
        <div className="cyber-welcome-box">
          <div className="cyber-hex-orb">
            <Cpu size={32} color="#00f0ff" />
          </div>
          <h2 className="cyber-welcome-title">NOZEL // STUDIO 2030</h2>
          <p className="cyber-welcome-desc">
            Ultra-lightweight quantum code matrix for macOS Apple Silicon.
            Zero bloat, 38 MB memory footprint, native Claude Pro Neural Companion.
          </p>
          <div className="cyber-welcome-actions">
            <button className="cyber-btn-primary" onClick={onOpenFolder}>
              <Terminal size={13} />
              <span>[ MOUNT PROJECT ]</span>
            </button>
            <button className="cyber-btn-secondary" onClick={onToggleClaude}>
              <Sparkles size={13} color="#00f0ff" />
              <span>[ NEURAL CLAUDE HUB ]</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Parse path breadcrumbs in cyber format
  const pathParts = activeTab.path.split("/").filter(Boolean);
  const displayParts = pathParts.length > 3 ? pathParts.slice(-3) : pathParts;

  // Generate minimap line representations
  const codeLines = activeTab.content.split("\n").slice(0, 50);

  return (
    <div className="app-editor-area">
      {/* 1. Cyber HUD Breadcrumbs Bar */}
      <div className="cyber-breadcrumbs-bar">
        <span className="cyber-crumb-root">// NOZEL</span>
        <ChevronRight size={11} className="cyber-crumb-sep" />
        {displayParts.slice(0, -1).map((part, idx) => (
          <React.Fragment key={idx}>
            <span className="cyber-crumb-dir">{part.toUpperCase()}</span>
            <ChevronRight size={11} className="cyber-crumb-sep" />
          </React.Fragment>
        ))}
        <span className="cyber-crumb-active">
          <FileIcon filename={activeTab.name} size={13} />
          {activeTab.name}
        </span>
      </div>

      {/* 2. Main Editor Split with Holographic Minimap on Right */}
      <div className="cyber-editor-layout">
        <div className="cyber-code-container" ref={editorContainerRef} />

        {/* Futuristic Code Minimap HUD */}
        <aside className="cyber-minimap-hud" aria-hidden="true">
          <div className="cyber-minimap-header">HUD_MAP</div>
          <div className="cyber-minimap-slider" />
          <div className="cyber-minimap-lines">
            {codeLines.map((line, idx) => {
              const len = Math.min(Math.max(line.trim().length * 2.2, 8), 90);
              const isComment = line.trim().startsWith("//");
              const isImport = line.trim().startsWith("import") || line.trim().startsWith("export");
              const isSpecial = line.trim().startsWith("return") || line.trim().startsWith("const");

              let color = "rgba(255, 255, 255, 0.25)";
              if (isComment) color = "rgba(100, 116, 139, 0.4)";
              else if (isImport) color = "rgba(244, 63, 94, 0.7)";
              else if (isSpecial) color = "rgba(0, 240, 255, 0.7)";

              return (
                <div
                  key={idx}
                  className="cyber-minimap-bar"
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
