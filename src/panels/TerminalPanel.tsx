import { Play, Plus, RotateCw, Square, Trash2, X, TerminalSquare } from "lucide-react";
import { CrabMascot } from "../components/CrabMascot";
import { useEffect, useRef } from "react";
import { openShell } from "../app/run";
import { Empty, IconButton } from "../components/ui";
import { setState, useStore } from "../state/store";
import * as T from "../terminal/terminals";
import { prettyKeys, shellName } from "../lib/keys";
import { tl } from "../i18n";

export default function TerminalPanel({ showTabs = true }: { showTabs?: boolean }) {
  const terminals = useStore((s) => s.terminals);
  const active = useStore((s) => s.activeTerminal);
  const host = useRef<HTMLDivElement>(null);
  const sess = terminals.find((t) => t.key === active) ?? terminals[terminals.length - 1];

  useEffect(() => {
    if (!sess || !host.current) return;
    const detach = T.attachTerminal(sess.key, host.current);
    return detach;
  }, [sess?.key]);

  if (!terminals.length) {
    return (
      <Empty icon={<TerminalSquare size={22} />} title={tl("Belum ada terminal")} action={<button className="btn btn-primary" onClick={() => void openShell()}>{tl("Buka terminal")}</button>}>
        Terminal sungguhan ({shellName()}) di folder project. <kbd className="kbd">{prettyKeys("Ctrl+`")}</kbd>
      </Empty>
    );
  }

  return (
    <div className="terminal-panel">
      {showTabs && (
        <div className="term-tabs" role="tablist" aria-label={tl("Sesi terminal")}>
          {terminals.map((t) => (
            <div key={t.key} role="tab" aria-selected={t.key === sess?.key} tabIndex={0} className={`term-tab ${t.key === sess?.key ? "is-active" : ""} st-${t.status}`} onClick={() => setState({ activeTerminal: t.key })} onKeyDown={(e) => e.key === "Enter" && setState({ activeTerminal: t.key })}>
              {t.kind === "run" ? <Play size={11} aria-hidden /> : t.kind === "claude" ? <CrabMascot size={13} /> : <TerminalSquare size={11} aria-hidden />}
              <span className="term-title">{t.title}</span>
              {t.status === "exited" && t.kind !== "shell" && <span className={`term-code ${t.exitCode === 0 ? "ok" : "bad"}`}>{t.exitCode ?? "?"}</span>}
              <button
                className="term-x"
                aria-label={`Tutup ${t.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void T.closeTerminal(t.key);
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <IconButton label={tl("Terminal baru")} keys="Ctrl+Shift+`" onClick={() => void openShell()}>
            <Plus size={13} />
          </IconButton>
          <span className="spacer" />
          {sess && (
            <>
              {sess.kind === "run" && (
                <IconButton label={sess.status === "running" ? "Jalankan ulang" : "Jalankan lagi"} onClick={() => void T.rerun(sess.key)}>
                  <RotateCw size={13} />
                </IconButton>
              )}
              {sess.status === "running" && (
                <IconButton label={tl("Hentikan")} tone="danger" onClick={() => void T.stopTerminal(sess.key)}>
                  <Square size={12} />
                </IconButton>
              )}
              <IconButton label={tl("Minta agen AI menjelaskan output ini")} onClick={() => void import("../claude/claude").then((m) => m.explainTerminal(sess.key))}>
                <CrabMascot size={15} />
              </IconButton>
              <IconButton label={tl("Bersihkan")} onClick={() => T.clearTerminal(sess.key)}>
                <Trash2 size={13} />
              </IconButton>
            </>
          )}
        </div>
      )}
      <div className="term-stage" ref={host} onClick={() => T.focusTerminal(sess?.key ?? null)} />
    </div>
  );
}
