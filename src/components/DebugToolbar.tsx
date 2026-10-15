// Toolbar debug mengambang di atas editor (seperti VS Code): lanjut/jeda, step, restart, stop.

import { ArrowDownToLine, ArrowRightToLine, ArrowUpFromLine, Pause, Play, RotateCw, Square } from "lucide-react";
import { continueRun, pauseRun, restartDebug, stepInto, stepOut, stepOver, stopDebug } from "../debug/debug";
import { useDebug } from "../debug/state";
import { IconButton } from "./ui";

export function DebugToolbar() {
  const status = useDebug((s) => s.status);
  const name = useDebug((s) => s.name);
  if (status === "idle" || status === "stopped") return null;
  const paused = status === "paused";
  return (
    <div className="dbg-toolbar" role="toolbar" aria-label={`Debug: ${name ?? ""}`}>
      {paused ? (
        <IconButton label="Lanjutkan" keys="F5" onClick={() => void continueRun()}>
          <Play size={14} />
        </IconButton>
      ) : (
        <IconButton label="Jeda" keys="F6" onClick={() => void pauseRun()} disabled={status === "starting"}>
          <Pause size={14} />
        </IconButton>
      )}
      <IconButton label="Step over" keys="F10" onClick={() => void stepOver()} disabled={!paused}>
        <ArrowRightToLine size={14} />
      </IconButton>
      <IconButton label="Step into" keys="F11" onClick={() => void stepInto()} disabled={!paused}>
        <ArrowDownToLine size={14} />
      </IconButton>
      <IconButton label="Step out" keys="Shift+F11" onClick={() => void stepOut()} disabled={!paused}>
        <ArrowUpFromLine size={14} />
      </IconButton>
      <IconButton label="Mulai ulang" keys="Mod+Shift+F5" onClick={() => void restartDebug()}>
        <RotateCw size={14} />
      </IconButton>
      <IconButton label="Hentikan" keys="Shift+F5" tone="danger" onClick={() => void stopDebug()}>
        <Square size={13} />
      </IconButton>
    </div>
  );
}
