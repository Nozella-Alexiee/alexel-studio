import React, { useState, useRef, useEffect } from "react";
import { CodeProblem, CodeRunResult, TerminalHistoryEntry } from "../types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
  Filter,
  Trash2,
  RotateCw,
  Loader2,
} from "lucide-react";
import { FileIcon } from "./FileIcon";

export type PanelTab = "problems" | "output" | "debug" | "terminal";

interface ProblemsPanelProps {
  problems: CodeProblem[];
  activeFileName?: string;
  onSelectProblem: (line: number, col: number) => void;
  onClose: () => void;
  runResult?: CodeRunResult | null;
  isRunning?: boolean;
  onRerun?: () => void;
  onClearOutput?: () => void;
  terminalHistory?: TerminalHistoryEntry[];
  onExecuteTerminalCommand?: (cmd: string) => Promise<void>;
  activeTabOverride?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;
}

export const ProblemsPanel: React.FC<ProblemsPanelProps> = ({
  problems,
  activeFileName,
  onSelectProblem,
  onClose,
  runResult,
  isRunning,
  onRerun,
  onClearOutput,
  terminalHistory = [],
  onExecuteTerminalCommand,
  activeTabOverride,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<PanelTab>("problems");
  const activeTab = activeTabOverride ?? internalTab;

  const handleSelectTab = (tab: PanelTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [isExecutingCmd, setIsExecutingCmd] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "terminal") {
      terminalInputRef.current?.focus();
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (activeTab === "output") {
      outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTab, terminalHistory, runResult]);

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warnCount = problems.filter((p) => p.severity === "warning").length;
  const totalCount = errorCount + warnCount;

  const filteredProblems = problems.filter((p) =>
    filterText ? p.message.toLowerCase().includes(filterText.toLowerCase()) : true
  );

  const handleTerminalKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = terminalInput.trim();
      if (!cmd || isExecutingCmd) return;
      setIsExecutingCmd(true);
      try {
        if (onExecuteTerminalCommand) {
          await onExecuteTerminalCommand(cmd);
        }
      } finally {
        setIsExecutingCmd(false);
        setTerminalInput("");
        setHistoryIndex(null);
      }
    } else if (e.key === "ArrowUp") {
      if (terminalHistory.length === 0) return;
      e.preventDefault();
      const nextIdx =
        historyIndex === null ? terminalHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setTerminalInput(terminalHistory[nextIdx].command);
    } else if (e.key === "ArrowDown") {
      if (historyIndex === null) return;
      e.preventDefault();
      if (historyIndex < terminalHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setTerminalInput(terminalHistory[nextIdx].command);
      } else {
        setHistoryIndex(null);
        setTerminalInput("");
      }
    }
  };

  return (
    <div className="vscode-bottom-panel" role="region" aria-label="Problems Panel">
      {/* VS Code Authentic Panel Tabs Header */}
      <div className="vscode-panel-header">
        <div className="vscode-panel-tabs">
          <button
            className={`vscode-panel-tab ${activeTab === "problems" ? "active" : ""}`}
            onClick={() => handleSelectTab("problems")}
          >
            <span>PROBLEMS</span>
            {totalCount > 0 && (
              <span className="vscode-panel-badge">{totalCount}</span>
            )}
          </button>
          <button
            className={`vscode-panel-tab ${activeTab === "output" ? "active" : ""}`}
            onClick={() => handleSelectTab("output")}
          >
            <span>OUTPUT</span>
            {isRunning && (
              <Loader2 size={10} className="spin text-cyan-400" />
            )}
          </button>
          <button
            className={`vscode-panel-tab ${activeTab === "debug" ? "active" : ""}`}
            onClick={() => handleSelectTab("debug")}
          >
            <span>DEBUG CONSOLE</span>
          </button>
          <button
            className={`vscode-panel-tab ${activeTab === "terminal" ? "active" : ""}`}
            onClick={() => handleSelectTab("terminal")}
          >
            <span>TERMINAL</span>
          </button>
        </div>

        <div className="vscode-panel-actions">
          {activeTab === "problems" && (
            <div className="vscode-panel-filter">
              <Filter size={11} className="text-muted" />
              <input
                type="text"
                placeholder="Filter (e.g. text, line)"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="vscode-filter-input"
              />
            </div>
          )}

          {activeTab === "output" && (
            <div className="vscode-panel-runner-actions">
              {isRunning ? (
                <span className="vscode-runner-status-pill running">
                  <Loader2 size={11} className="spin" />
                  <span>running...</span>
                </span>
              ) : runResult ? (
                <>
                  <span
                    className={`vscode-runner-status-pill ${
                      runResult.exit_code === 0 || runResult.success ? "success" : "error"
                    }`}
                  >
                    <span>●</span>
                    <span>exit {runResult.exit_code ?? (runResult.success ? 0 : 1)}</span>
                  </span>
                  <span className="vscode-runner-time-badge">
                    ⏱ {runResult.execution_time_ms} ms
                  </span>
                </>
              ) : null}

              {onClearOutput && (
                <button
                  className="vscode-panel-action-btn"
                  onClick={onClearOutput}
                  title="Clear Output (🗑️)"
                >
                  <Trash2 size={13} />
                </button>
              )}
              {onRerun && (
                <button
                  className="vscode-panel-action-btn"
                  onClick={onRerun}
                  disabled={isRunning}
                  title="Rerun Code (🔄)"
                >
                  <RotateCw size={13} className={isRunning ? "spin" : ""} />
                </button>
              )}
            </div>
          )}

          {activeTab === "terminal" && onExecuteTerminalCommand && (
            <div className="vscode-panel-runner-actions">
              <button
                className="vscode-panel-action-btn"
                onClick={() => onExecuteTerminalCommand("clear")}
                title="Clear Terminal (🗑️)"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}

          <button
            className="vscode-panel-btn-close"
            onClick={onClose}
            title="Close Panel (Ctrl+` / ⌘⇧M)"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="vscode-panel-body">
        {activeTab === "problems" && (
          <div className="vscode-problems-content">
            {problems.length === 0 ? (
              <div className="vscode-empty-problems">
                <CheckCircle2 size={16} className="text-success" />
                <span>No problems have been detected in the workspace.</span>
              </div>
            ) : (
              <div className="vscode-problem-groups">
                {/* File Header Row */}
                <div
                  className="vscode-problem-file-header"
                  onClick={() => setIsGroupOpen(!isGroupOpen)}
                >
                  <span className="vscode-arrow-icon">
                    {isGroupOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  {activeFileName && <FileIcon filename={activeFileName} size={14} />}
                  <span className="vscode-file-name">{activeFileName || "Active File"}</span>
                  <span className="vscode-file-count-badge">
                    {totalCount} {totalCount === 1 ? "problem" : "problems"} ({errorCount} error{errorCount === 1 ? "" : "s"})
                  </span>
                </div>

                {/* Problem Items List */}
                {isGroupOpen && (
                  <div className="vscode-problems-list">
                    {filteredProblems.map((prob, idx) => (
                      <div
                        key={idx}
                        className={`vscode-problem-item ${prob.severity}`}
                        onClick={() => onSelectProblem(prob.line, prob.col)}
                        title={`Jump to Line ${prob.line}, Column ${prob.col}`}
                      >
                        <div className="vscode-problem-info">
                          {prob.severity === "error" ? (
                            <AlertCircle size={13} className="vscode-icon-error shrink-0" />
                          ) : (
                            <AlertTriangle size={13} className="vscode-icon-warning shrink-0" />
                          )}
                          <span className="vscode-problem-msg">{prob.message}</span>
                          <span className="vscode-problem-src">
                            [{prob.source || "Syntax"}]
                          </span>
                        </div>

                        <span className="vscode-problem-pos">
                          [{prob.line}, {prob.col}]
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "output" && (
          <div className="vscode-output-console">
            {isRunning && !runResult && (
              <div className="vscode-output-line term-meta">
                <Loader2 size={13} className="spin inline-icon" /> [Running] Executing active file...
              </div>
            )}

            {runResult ? (
              <>
                <div className="vscode-output-line term-meta">
                  [Running] {runResult.command}
                </div>
                <div className="vscode-output-divider" />
                {runResult.stdout && (
                  <pre className="vscode-output-pre term-stdout">{runResult.stdout}</pre>
                )}
                {runResult.stderr && (
                  <pre className="vscode-output-pre term-stderr">{runResult.stderr}</pre>
                )}
                <div className="vscode-output-divider" />
                <div
                  className={`vscode-output-line ${
                    runResult.exit_code === 0 || runResult.success ? "term-done" : "term-failed"
                  }`}
                >
                  [Done] exited with code={runResult.exit_code ?? (runResult.success ? 0 : 1)} in {(runResult.execution_time_ms / 1000).toFixed(3)} seconds
                </div>
              </>
            ) : !isRunning ? (
              <div className="vscode-output-empty">
                <span className="vscode-term-dim">[Nozel Code Runner] Ready to execute code.</span>
                <span className="vscode-term-dim">
                  Click ▶ Run in the top right or press ⌘R / F5 to run the active file.
                </span>
              </div>
            ) : null}
            <div ref={outputEndRef} />
          </div>
        )}

        {activeTab === "debug" && (
          <div className="vscode-terminal-view">
            <span className="vscode-term-dim">Debug session inactive. Press F5 or launch configuration.</span>
          </div>
        )}

        {activeTab === "terminal" && (
          <div
            className="vscode-terminal-view"
            onClick={() => terminalInputRef.current?.focus()}
          >
            {terminalHistory.map((entry) => (
              <div key={entry.id} className="vscode-terminal-entry">
                <div className="vscode-terminal-cmdline">
                  <span className="vscode-term-prompt">macbook:nozel-project user$&nbsp;</span>
                  <span className="vscode-term-input-cmd">{entry.command}</span>
                </div>
                {entry.result && (
                  <div className="vscode-terminal-entry-result">
                    {entry.result.stdout && (
                      <pre className="vscode-output-pre term-stdout">{entry.result.stdout}</pre>
                    )}
                    {entry.result.stderr && (
                      <pre className="vscode-output-pre term-stderr">{entry.result.stderr}</pre>
                    )}
                    {entry.result.exit_code !== 0 && entry.result.exit_code !== null && (
                      <div className="vscode-term-exit-error">
                        Exited with code {entry.result.exit_code}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="vscode-terminal-prompt-line">
              <span className="vscode-term-prompt">macbook:nozel-project user$&nbsp;</span>
              <input
                ref={terminalInputRef}
                type="text"
                className="vscode-terminal-input"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={handleTerminalKeyDown}
                disabled={isExecutingCmd}
                placeholder={
                  isExecutingCmd
                    ? "Executing command..."
                    : "Type command and press Enter (e.g. ls, pwd, php -v)"
                }
              />
              {isExecutingCmd && <Loader2 size={12} className="spin text-cyan-400" />}
            </div>
            <div ref={terminalEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ProblemsPanel;
