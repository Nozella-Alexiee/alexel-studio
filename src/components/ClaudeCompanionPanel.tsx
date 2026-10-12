import React, { useState } from "react";
import { ClaudeCliInfo, EditorTab } from "../types";
import {
  Sparkles,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

interface ClaudeCompanionPanelProps {
  claudeInfo?: ClaudeCliInfo;
  projectPath: string | null;
  activeTab?: EditorTab;
  isOpen: boolean;
  onClose: () => void;
  onRefreshCli: () => void;
  onLaunchTerminal: (prompt?: string) => Promise<string>;
  onRunCliPrint: (prompt: string, context?: string) => Promise<string>;
}

export const ClaudeCompanionPanel: React.FC<ClaudeCompanionPanelProps> = ({
  claudeInfo,
  projectPath,
  activeTab,
  isOpen,
  onClose,
  onRefreshCli,
  onLaunchTerminal,
  onRunCliPrint,
}) => {
  const [prompt, setPrompt] = useState("");
  const [includeActiveFile, setIncludeActiveFile] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showPayloadReview, setShowPayloadReview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activeContext =
    includeActiveFile && activeTab
      ? `File: ${activeTab.name} (${activeTab.path})\n\`\`\`${activeTab.name.split(".").pop() || ""}\n${activeTab.content}\n\`\`\``
      : undefined;

  const handleLaunchTerminal = async () => {
    if (!projectPath) {
      setStatusMessage("Please open a project folder first.");
      return;
    }
    try {
      setIsRunning(true);
      const res = await onLaunchTerminal(prompt.trim() || undefined);
      setStatusMessage(res);
    } catch (err) {
      setStatusMessage(`Failed: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunQuery = async () => {
    if (!projectPath) {
      setStatusMessage("Please open a project folder first.");
      return;
    }
    if (!prompt.trim()) {
      setStatusMessage("Please enter a question or prompt.");
      return;
    }
    if (!isAuthorized) {
      setStatusMessage("Explicit authorization is required before sending context.");
      return;
    }

    try {
      setIsRunning(true);
      setStatusMessage("Executing query via local Claude Code CLI...");
      const res = await onRunCliPrint(prompt.trim(), activeContext);
      setOutput(res);
      setStatusMessage("Query executed successfully.");
    } catch (err) {
      setStatusMessage(`Error: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <aside className="claude-drawer">
      <div className="claude-drawer-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} color="var(--accent-color)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-main)" }}>
            Claude Code Companion
          </span>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close Panel">
          <X size={15} />
        </button>
      </div>

      <div className="claude-drawer-content">
        {/* Subscription Notice */}
        <div
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600, color: "var(--accent-color)" }}>
            <ShieldCheck size={14} />
            <span>Claude Pro / Max CLI Bridge</span>
          </div>
          Uses your official <strong>Claude Code CLI</strong> subscription. No API keys or pay-per-token billing embedded in the app. Runs purely on your local macOS machine.
        </div>

        {/* CLI Connection Status */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>
              CLI Environment
            </span>
            <button className="btn-icon" onClick={onRefreshCli} title="Check CLI Status">
              <RefreshCw size={12} />
            </button>
          </div>

          {claudeInfo?.installed ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--success-color)", fontWeight: 500, fontSize: 12 }}>
                <CheckCircle2 size={14} />
                <span>Claude Code CLI Active</span>
              </div>
              {claudeInfo.version && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {claudeInfo.version}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--dirty-indicator)", fontWeight: 500, fontSize: 12 }}>
                <AlertTriangle size={14} />
                <span>CLI Not Found in PATH</span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                To connect your Claude Pro subscription, run in macOS Terminal:
              </p>
              <pre
                style={{
                  background: "var(--bg-editor)",
                  padding: "6px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent-color)",
                  overflowX: "auto",
                }}
              >
                npm i -g @anthropic-ai/claude-code{"\n"}claude login
              </pre>
            </div>
          )}
        </div>

        {/* Direct Terminal Launcher */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>
            Interactive Agent Session
          </span>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            Open full interactive Claude Code session in native macOS Terminal within current project.
          </p>
          <button
            className="btn-primary"
            onClick={() => handleLaunchTerminal()}
            disabled={isRunning || !projectPath}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <Terminal size={14} />
            Launch Claude in Terminal
          </button>
        </div>

        {/* Quick Ask / Dispatcher */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>
            Quick Task &amp; Inspection
          </span>

          <textarea
            className="input-text"
            rows={3}
            placeholder="Ask Claude Code (e.g. explain this code, suggest tests, optimize M1 performance)..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />

          {activeTab && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeActiveFile}
                onChange={(e) => setIncludeActiveFile(e.target.checked)}
              />
              <span>Include active file ({activeTab.name})</span>
            </label>
          )}

          {/* Transparent Payload Preview Accordion */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={() => setShowPayloadReview(!showPayloadReview)}
            >
              {showPayloadReview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span>Preview Payload &amp; Action</span>
            </button>

            {showPayloadReview && (
              <div
                style={{
                  marginTop: 6,
                  padding: 8,
                  background: "var(--bg-editor)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)",
                  maxHeight: 120,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                <strong>Command:</strong> claude -p &quot;{prompt || "(empty)"}&quot;{"\n"}
                <strong>Context:</strong> {activeContext ? `${activeTab?.name} (${activeTab?.content.length} bytes)` : "None"}
              </div>
            )}
          </div>

          {/* Explicit User Consent Checkbox */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              fontSize: 11.5,
              color: isAuthorized ? "var(--text-main)" : "var(--text-muted)",
              cursor: "pointer",
              lineHeight: 1.35,
            }}
          >
            <input
              type="checkbox"
              checked={isAuthorized}
              onChange={(e) => setIsAuthorized(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              I authorize Nozel Code to pass this context to my local Claude Code CLI.
            </span>
          </label>

          <button
            className="btn-primary"
            onClick={handleRunQuery}
            disabled={isRunning || !isAuthorized || !prompt.trim() || !projectPath}
            style={{
              width: "100%",
              justifyContent: "center",
              opacity: !isAuthorized || !prompt.trim() || !projectPath ? 0.6 : 1,
            }}
          >
            <Play size={14} />
            {isRunning ? "Running..." : "Run Quick Query"}
          </button>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 11.5,
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Query Output Display */}
        {output && (
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Response
              </span>
              <button className="btn-icon" onClick={handleCopyOutput} title="Copy Output">
                {copied ? <Check size={12} color="var(--success-color)" /> : <Copy size={12} />}
              </button>
            </div>
            <pre
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                lineHeight: 1.45,
                color: "var(--text-main)",
                whiteSpace: "pre-wrap",
                maxHeight: 220,
                overflowY: "auto",
                background: "var(--bg-editor)",
                padding: 10,
                borderRadius: 6,
              }}
            >
              {output}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
