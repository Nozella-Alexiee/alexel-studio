// Item status bar buatan ekstensi (vscode.window.createStatusBarItem), kiri dan kanan.

import { hostCall } from "./client";
import { useExtHost, type StatusItem } from "./state";
import { toast } from "../state/store";

function Item({ it }: { it: StatusItem }) {
  const text = (it.text ?? "").replace(/\$\(([\w-]+)(~spin)?\)/g, "");
  const run = () => {
    if (!it.command) return;
    void hostCall("command/execute", { id: it.command, args: it.args ?? [] }).catch((e) => toast(String(e instanceof Error ? e.message : e), "error"));
  };
  const style = it.color && !it.color.includes(".") ? { color: it.color } : undefined;
  return it.command ? (
    <button className="status-item" title={it.tooltip ?? it.owner} onClick={run} style={style}>
      {text}
    </button>
  ) : (
    <span className="status-item" title={it.tooltip ?? it.owner} style={style}>
      {text}
    </span>
  );
}

export function ExtStatusItems({ side }: { side: "left" | "right" }) {
  const status = useExtHost((s) => s.status);
  const align = side === "left" ? 1 : 2;
  const items = Object.values(status)
    .filter((i) => i.visible && i.alignment === align && (i.text ?? "").replace(/\$\([\w-]+(~spin)?\)/g, "").trim())
    .sort((a, b) => (side === "left" ? b.priority - a.priority : a.priority - b.priority));
  return (
    <>
      {items.map((i) => (
        <Item key={i.id} it={i} />
      ))}
    </>
  );
}
