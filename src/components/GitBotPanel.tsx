import React, { useState } from "react";
import { GitStatus, GitPushResult } from "../types";
import { GitBranch, UploadCloud, RefreshCw, CheckCircle2, Bot, Zap } from "lucide-react";

interface GitBotPanelProps {
  gitStatus?: GitStatus;
  autoPushEnabled: boolean;
  onToggleAutoPush: (enabled: boolean) => void;
  onRefresh: () => void;
  onCommitAndPush: (customMessage?: string) => Promise<GitPushResult | undefined>;
  isLoading: boolean;
}

export const GitBotPanel: React.FC<GitBotPanelProps> = ({
  gitStatus,
  autoPushEnabled,
  onToggleAutoPush,
  onRefresh,
  onCommitAndPush,
  isLoading,
}) => {
  const [commitMessage, setCommitMessage] = useState("");
  const [lastResult, setLastResult] = useState<GitPushResult | null>(null);

  const handleManualPush = async () => {
    const res = await onCommitAndPush(commitMessage.trim() || undefined);
    if (res) {
      setLastResult(res);
      setCommitMessage("");
    }
  };

  return (
    <div className="apple-git-panel">
      {/* Header */}
      <div className="git-panel-header">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-emerald-400" />
          <span className="font-semibold text-sm text-white">Source Control & GitHub</span>
        </div>
        <button
          className="btn-icon"
          onClick={onRefresh}
          title="Refresh Git Status"
          disabled={isLoading}
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin text-cyan-400" : "text-slate-400"} />
        </button>
      </div>

      <div className="git-panel-content">
        {/* Auto Git Bot Pill Switcher */}
        <div className="git-bot-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Bot size={15} />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Auto Git Bot
                  {autoPushEnabled && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">Auto commit & push on Cmd+S</div>
              </div>
            </div>

            <label className="apple-toggle">
              <input
                type="checkbox"
                checked={autoPushEnabled}
                onChange={(e) => onToggleAutoPush(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {autoPushEnabled && (
            <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-emerald-300">
              <Zap size={11} className="text-emerald-400" />
              <span>Setiap kali kamu menekan <strong>Cmd + S</strong>, bot otomatis commit & push ke GitHub.</span>
            </div>
          )}
        </div>

        {/* Branch & Status Overview */}
        <div className="git-meta-box">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Active Branch</span>
            <span className="font-mono font-bold text-cyan-300 flex items-center gap-1">
              <span>🌿</span> {gitStatus?.branch || "main"}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Modified Files</span>
            <span className="font-mono font-semibold text-amber-300">
              {gitStatus?.modified_count || 0}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Untracked Files</span>
            <span className="font-mono font-semibold text-purple-300">
              {gitStatus?.untracked_count || 0}
            </span>
          </div>
        </div>

        {/* Commit Input & Push Button */}
        <div className="space-y-2">
          <input
            type="text"
            className="apple-input font-mono text-xs"
            placeholder="Commit message (e.g. feat: new component)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            disabled={isLoading}
          />

          <button
            className="apple-btn-primary w-full flex items-center justify-center gap-2"
            onClick={handleManualPush}
            disabled={isLoading || (!gitStatus?.has_changes && !commitMessage)}
          >
            <UploadCloud size={14} />
            <span>{isLoading ? "Syncing with GitHub..." : "Commit & Push to GitHub"}</span>
          </button>
        </div>

        {/* Changed Files List */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400 tracking-wider flex justify-between">
            <span>CHANGES ({gitStatus?.changed_files.length || 0})</span>
          </div>

          <div className="git-files-list">
            {!gitStatus || gitStatus.changed_files.length === 0 ? (
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center text-xs text-slate-500">
                <CheckCircle2 size={16} className="mx-auto text-emerald-400 mb-1" />
                Working tree bersih (100% Synced)
              </div>
            ) : (
              gitStatus.changed_files.map((file, idx) => (
                <div key={idx} className="git-file-item">
                  <span className="text-amber-400 font-mono text-[10px]">M</span>
                  <span className="font-mono text-xs text-slate-300 truncate">{file}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Last Bot Output Notice */}
        {lastResult && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 size={13} />
              <span>Git Bot Sync Sukses</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">{lastResult.message}</p>
          </div>
        )}
      </div>
    </div>
  );
};
