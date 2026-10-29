import { ChevronDown, X } from "lucide-react";
import { Suspense, lazy } from "react";
import { togglePanel } from "../app/actions";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { IconButton, Spinner } from "../components/ui";
import { setLayout, useLayout, useStore, type PanelId } from "../state/store";
import { PortsPanel, ProblemsPanel, TodoPanel } from "./BottomPanels";
import { tl } from "../i18n";
import { useDb } from "../db/state";

const TerminalPanel = lazy(() => import("./TerminalPanel"));
const HistoryPanel = lazy(() => import("./HistoryPanel"));
const OutputPanel = lazy(() => import("./OutputPanel"));
const DebugConsole = lazy(() => import("./DebugConsole"));
const ResultsPanel = lazy(() => import("../db/ResultsPanel"));

export function PanelTabs({ upper }: { upper?: boolean }) {
  const layout = useLayout();
  const problems = useStore((s) => Object.values(s.problems).reduce((a, l) => a + l.length, 0));
  const terms = useStore((s) => s.terminals.length);
  const todos = useStore((s) => s.todos?.length ?? 0);
  const hasResults = useDb((s) => s.results.length > 0);
  const label = (s: string) => (upper ? s.toUpperCase() : s);
  const tabs: { id: PanelId; label: string; count?: number }[] = [
    { id: "terminal", label: label("Terminal"), count: terms > 1 ? terms : undefined },
    { id: "problems", label: label(tl("Masalah")), count: problems || undefined },
    { id: "output", label: label("Output") },
    { id: "debug", label: label("Debug Console") },
    { id: "ports", label: label("Port") },
    { id: "todo", label: label("TODO"), count: todos || undefined },
    { id: "history", label: label(tl("Riwayat")) },
    ...(hasResults || layout.panelTab === "db" ? [{ id: "db" as PanelId, label: label(tl("Hasil query")) }] : []),
  ];
  return (
    <div className="panel-tabs" role="tablist" aria-label={tl("Panel bawah")}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={layout.panelTab === t.id} className={`panel-tab ${layout.panelTab === t.id ? "is-active" : ""}`} onClick={() => setLayout({ panelTab: t.id, panel: true })}>
          {t.label}
          {t.count !== undefined && <span className="count-badge">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PanelContent({ terminalTabs = true }: { terminalTabs?: boolean }) {
  const layout = useLayout();
  return (
    <div className="panel-content" role="tabpanel">
      <ErrorBoundary>
      <Suspense fallback={<div className="pad"><Spinner /></div>}>
        {layout.panelTab === "terminal" && <TerminalPanel showTabs={terminalTabs} />}
        {layout.panelTab === "problems" && <ProblemsPanel />}
        {layout.panelTab === "output" && <OutputPanel />}
        {layout.panelTab === "debug" && <DebugConsole />}
        {layout.panelTab === "ports" && <PortsPanel />}
        {layout.panelTab === "todo" && <TodoPanel />}
        {layout.panelTab === "history" && <HistoryPanel />}
        {layout.panelTab === "db" && <ResultsPanel />}
      </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export function BottomPanel({ className = "", upper }: { className?: string; upper?: boolean }) {
  return (
    <section className={`bottom-panel ${className}`} aria-label={tl("Panel bawah")}>
      <div className="panel-head">
        <PanelTabs upper={upper} />
        <span className="spacer" />
        <IconButton label={tl("Sembunyikan panel")} keys="Mod+J" onClick={() => togglePanel()}>
          <ChevronDown size={14} />
        </IconButton>
        <IconButton label={tl("Tutup panel")} onClick={() => setLayout({ panel: false })}>
          <X size={14} />
        </IconButton>
      </div>
      <PanelContent />
    </section>
  );
}
