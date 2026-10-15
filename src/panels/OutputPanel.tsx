import { Copy, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { CHANNELS, clearOutput, useOutput, type Channel } from "../app/output";
import { IconButton } from "../components/ui";
import { toast } from "../state/store";
import { tl } from "../i18n";

const NONE: string[] = [];

export default function OutputPanel() {
  const channel = useOutput((s) => s.channel);
  const lines = useOutput((s) => s.lines[channel] ?? NONE);
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div className="output-panel">
      <div className="output-bar">
        <select className="input select" value={channel} onChange={(e) => useOutput.setState({ channel: e.target.value as Channel })} aria-label={tl("Saluran output")}>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {tl(c)}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <IconButton
          label={tl("Salin semua")}
          onClick={() => {
            void navigator.clipboard.writeText(lines.join("\n"));
            toast(tl("Output disalin."), "success");
          }}
          disabled={!lines.length}
        >
          <Copy size={13} />
        </IconButton>
        <IconButton label={tl("Bersihkan")} onClick={() => clearOutput(channel)} disabled={!lines.length}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <pre className="output-text" ref={box} tabIndex={0} aria-label={`Output ${channel}`}>
        {lines.length ? lines.join("\n") : <span className="hint">{tl("Belum ada output di saluran ini.")}</span>}
      </pre>
    </div>
  );
}
