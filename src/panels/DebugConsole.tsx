// Debug Console: output program & adapter, plus evaluasi ekspresi (REPL) saat program berhenti.

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../components/ui";
import { evaluateRepl } from "../debug/debug";
import { setDbg, useDebug } from "../debug/state";
import { tl } from "../i18n";

export default function DebugConsole() {
  const lines = useDebug((s) => s.console);
  const status = useDebug((s) => s.status);
  const [expr, setExpr] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div className="dbg-console">
      <div className="output-bar">
        <span className="hint">{status === "paused" ? tl("Program berhenti, ekspresi dievaluasi di frame terpilih.") : status === "running" ? tl("Program berjalan.") : tl("Tidak ada sesi debug.")}</span>
        <span className="spacer" />
        <IconButton label={tl("Bersihkan")} onClick={() => setDbg({ console: [] })} disabled={!lines.length}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <div className="dbg-console-lines" ref={box} role="log" aria-label={tl("Debug console")}>
        {lines.map((l, i) => (
          <div key={i} className={`dbg-line k-${l.kind}`}>
            {l.kind === "in" ? "› " : l.kind === "result" ? "‹ " : ""}
            {l.text}
          </div>
        ))}
      </div>
      <form
        className="dbg-console-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (!expr.trim()) return;
          void evaluateRepl(expr);
          setHist((h) => [...h.slice(-50), expr]);
          setHi(-1);
          setExpr("");
        }}
      >
        <span aria-hidden>›</span>
        <input
          className="input"
          value={expr}
          placeholder={status === "paused" ? tl("Evaluasi ekspresi…") : tl("Tersedia saat program berhenti")}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && hist.length) {
              e.preventDefault();
              const n = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1);
              setHi(n);
              setExpr(hist[n]);
            } else if (e.key === "ArrowDown" && hi >= 0) {
              e.preventDefault();
              const n = hi + 1;
              if (n >= hist.length) {
                setHi(-1);
                setExpr("");
              } else {
                setHi(n);
                setExpr(hist[n]);
              }
            }
          }}
          aria-label={tl("Ekspresi debug")}
        />
      </form>
    </div>
  );
}
