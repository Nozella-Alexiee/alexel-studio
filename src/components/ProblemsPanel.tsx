import React from "react";
import { CodeProblem } from "../types";
import { AlertTriangle, XCircle, CheckCircle2, ChevronRight, X } from "lucide-react";

interface ProblemsPanelProps {
  problems: CodeProblem[];
  activeFileName?: string;
  onSelectProblem: (line: number, col: number) => void;
  onClose: () => void;
}

export const ProblemsPanel: React.FC<ProblemsPanelProps> = ({
  problems,
  activeFileName,
  onSelectProblem,
  onClose,
}) => {
  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warnCount = problems.filter((p) => p.severity === "warning").length;

  return (
    <div className="apple-problems-panel">
      {/* Panel Header */}
      <div className="problems-header">
        <div className="flex items-center gap-3">
          <span className="font-bold text-xs text-white">PROBLEMS</span>
          <span className="text-[11px] font-mono text-slate-400">
            {activeFileName || "No file open"}
          </span>
          <div className="flex items-center gap-2">
            <span className="badge-err">
              {errorCount} Errors
            </span>
            <span className="badge-warn">
              {warnCount} Warnings
            </span>
          </div>
        </div>

        <button className="btn-icon" onClick={onClose} title="Close Problems Panel">
          <X size={13} className="text-slate-400 hover:text-white" />
        </button>
      </div>

      {/* Problems List */}
      <div className="problems-list">
        {problems.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5" style={{ padding: "16px" }}>
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span>Tidak ada error atau peringatan syntax di file ini. (All Clear)</span>
          </div>
        ) : (
          problems.map((prob, idx) => (
            <div
              key={idx}
              className={`problem-item ${prob.severity}`}
              onClick={() => onSelectProblem(prob.line, prob.col)}
            >
              <div className="flex items-center gap-2 flex-1" style={{ minWidth: 0 }}>
                {prob.severity === "error" ? (
                  <XCircle size={13} className="text-red-400 shrink-0" />
                ) : (
                  <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                )}
                <span className="text-xs text-slate-200 problem-msg">{prob.message}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-slate-400">
                  Line {prob.line}, Col {prob.col}
                </span>
                <ChevronRight size={11} className="text-slate-500" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProblemsPanel;
