import React, { useEffect, useRef, useState } from "react";
import { EditorTab, ThemeMode, CodeProblem } from "../types";
import { detectLanguage } from "../utils/editorLanguage";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { getSyntaxTheme } from "../utils/syntaxTheme";
import { createCodeLinter } from "../utils/codeLinter";
import { createCodeAutocomplete } from "../utils/codeAutocomplete";
import { Cpu, Folder, Sparkles, ChevronRight } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { ImageViewer } from "./ImageViewer";
import { MarkdownViewer } from "./MarkdownViewer";
import { CodeMinimap } from "./CodeMinimap";

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
  problems?: CodeProblem[];
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
  problems = [],
}) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const [activeProblems, setActiveProblems] = useState<CodeProblem[]>([]);
  const [markdownMode, setMarkdownMode] = useState<"code" | "split" | "preview">("split");

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

  // Initialize CodeMirror view when tab changes
  useEffect(() => {
    if (!editorContainerRef.current || !activeTab || activeTab.isImage) {
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

    // 1. Diagnostics / Real-time Wavy Red Squiggly Error Tracker
    const linterExt = createCodeLinter(activeTab.name, (diagnostics) => {
      if (!editorViewRef.current || !onDiagnosticsChangeRef.current) return;
      const view = editorViewRef.current;
      const doc = view.state.doc;
      const parsedProblems: CodeProblem[] = diagnostics.map((d) => {
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
      setActiveProblems(parsedProblems);
      onDiagnosticsChangeRef.current(parsedProblems);
    });

    // 2. Autocomplete & Code Snippets
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

    // Asynchronously load language grammar if dynamic loader is available
    if (langInfo.loadAsync && (!langInfo.extension || (Array.isArray(langInfo.extension) && langInfo.extension.length === 0))) {
      langInfo.loadAsync().then((asyncExt) => {
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            effects: languageCompartmentRef.current.reconfigure(asyncExt),
          });
        }
      }).catch((err) => {
        console.warn("Async language loader error:", err);
      });
    }

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [activeTab?.id, activeTab?.isImage]);

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

  // Update theme dynamically
  useEffect(() => {
    if (!editorViewRef.current) return;
    editorViewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(getSyntaxTheme(theme)),
    });
  }, [theme]);

  // Welcome state if no tab is open
  if (!activeTab) {
    return (
      <div className="app-editor-area pro-welcome">
        <div className="pro-welcome-box">
          <div className="pro-welcome-orb">
            <Cpu size={32} color="var(--accent-color)" />
          </div>
          <h2 className="pro-welcome-title">Nozel Code</h2>
          <p className="pro-welcome-desc">
            Ultra-lightweight native code editor for macOS Apple Silicon.
            Zero bloat, 38 MB memory footprint, native Claude Pro companion.
          </p>
          <div className="pro-welcome-actions">
            <button className="pro-btn-primary" onClick={onOpenFolder}>
              <Folder size={14} />
              <span>Open Folder</span>
            </button>
            <button className="pro-btn-secondary" onClick={onToggleClaude}>
              <Sparkles size={14} color="var(--accent-color)" />
              <span>Claude Companion</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Native Image Viewer
  if (activeTab.isImage) {
    return <ImageViewer tab={activeTab} />;
  }

  // Parse path breadcrumbs
  const pathParts = activeTab.path.split("/").filter(Boolean);
  const displayParts = pathParts.length > 3 ? pathParts.slice(-3) : pathParts;

  const isMarkdown =
    activeTab.name.endsWith(".md") ||
    activeTab.name.endsWith(".markdown") ||
    activeTab.language === "markdown" ||
    activeTab.language === "Markdown";

  const editorNode = (
    <div className="pro-code-wrapper">
      <div className="pro-code-container" ref={editorContainerRef} />
      <CodeMinimap
        content={activeTab.content}
        editorView={editorViewRef.current}
        theme={theme}
        problems={activeProblems.length > 0 ? activeProblems : problems}
      />
    </div>
  );

  return (
    <div className="app-editor-area">
      {/* 1. Clean macOS Studio Breadcrumbs Bar */}
      <div className="pro-breadcrumbs-bar">
        {displayParts.map((part, idx) => {
          const isLast = idx === displayParts.length - 1;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight size={11} className="pro-crumb-sep" />}
              <span className={`pro-crumb-item ${isLast ? "active" : ""}`}>
                {isLast && <FileIcon filename={activeTab.name} size={13} className="mr-1.5" />}
                <span>{part}</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* 2. Editor Layout: Markdown Live Preview or Standard Code Area */}
      {isMarkdown ? (
        <MarkdownViewer
          content={activeTab.content}
          mode={markdownMode}
          onModeChange={setMarkdownMode}
          editorElement={editorNode}
        />
      ) : (
        editorNode
      )}
    </div>
  );
};

export default EditorArea;
