// Tampilan pohon dari ekstensi (vscode.window.registerTreeDataProvider / createTreeView), mis. Todo Tree.
// Setiap tampilan jadi satu bagian yang bisa dilipat; isinya diambil lazy dari extension host.

import { ChevronDown, ChevronRight, File, Folder, Layers } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, Spinner } from "../components/ui";
import { hostCall } from "../exthost/client";
import { useExtHost } from "../exthost/state";
import { useExtViews } from "../exthost/views";
import { useWebviews } from "../exthost/webview";
import WebviewFrame from "./WebviewFrame";
import { toast } from "../state/store";
import { tl } from "../i18n";

interface Node {
  key: string;
  label: string;
  description?: string;
  collapsible: number;
  command?: { command: string; arguments?: unknown[] };
  tooltip?: string;
  icon?: string;
  resource?: string;
}

function Children({ viewId, parent, depth, version }: { viewId: string; parent?: string; depth: number; version: number }) {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setNodes(null);
    hostCall<Node[]>("tree/children", { viewId, element: parent })
      .then((n) => alive && setNodes(n))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [viewId, parent, version]);
  if (err) return <div className="hint pad-x">{err}</div>;
  if (!nodes) return <div style={{ paddingLeft: 12 + depth * 12 }}><Spinner size={11} /></div>;
  if (!nodes.length && depth === 0) return <div className="hint pad-x">{tl("Kosong.")}</div>;
  return (
    <>
      {nodes.map((n) => (
        <TreeNode key={n.key} viewId={viewId} node={n} depth={depth} version={version} />
      ))}
    </>
  );
}

function TreeNode({ viewId, node, depth, version }: { viewId: string; node: Node; depth: number; version: number }) {
  const [open, setOpen] = useState(node.collapsible === 2);
  const expandable = node.collapsible > 0;
  const click = useCallback(() => {
    if (expandable) setOpen((o) => !o);
    if (node.command) void hostCall("command/execute", { id: node.command.command, args: node.command.arguments ?? [] }).catch((e) => toast(String(e instanceof Error ? e.message : e), "error"));
  }, [expandable, node.command]);
  return (
    <>
      <button className="tree-row ext-tree-row" style={{ paddingLeft: 8 + depth * 12 }} onClick={click} title={node.tooltip ?? node.label}>
        <span className="tree-chev">{expandable ? open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden /> : null}</span>
        {node.resource ? <File size={13} aria-hidden /> : expandable ? <Folder size={13} aria-hidden /> : null}
        <span className="ext-tree-label">{node.label}</span>
        {node.description && <span className="ext-tree-desc">{node.description}</span>}
      </button>
      {expandable && open && <Children viewId={viewId} parent={node.key} depth={depth + 1} version={version} />}
    </>
  );
}

function WebviewSection({ viewId, title }: { viewId: string; title: string }) {
  const id = useWebviews((s) => s.views[viewId]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (id !== undefined) return;
    hostCall("webviewView/resolve", { viewId, title }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [viewId, title, id]);
  if (err) return <div className="hint pad-x">{err}</div>;
  if (id === undefined) return <div className="pad"><Spinner size={12} /></div>;
  return <WebviewFrame id={id} className="webview-frame webview-side" />;
}

export default function ExtViewsPanel() {
  const entries = useExtViews();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const views = useExtHost((s) => s.treeViews);
  if (!entries.length) return <Empty icon={<Layers size={24} />} title={tl("Tampilan ekstensi")}>{tl("Belum ada tampilan dari ekstensi. Pasang dan percayai ekstensi seperti Claude Code, Codex, atau Todo Tree.")}</Empty>;
  return (
    <div className="ext-views">
      <div className="side-head">
        <span className="side-title">{tl("Tampilan ekstensi")}</span>
      </div>
      <div className="ext-views-body">
        {entries.map(({ id, name, kind }) => {
          const isClosed = closed.has(id);
          return (
            <section key={id} className={kind === "webview" && !isClosed ? "ext-view-web" : ""}>
              <button className="git-section-head ext-view-head" onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; })} aria-expanded={!isClosed}>
                {isClosed ? <ChevronRight size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
                <span>{name}</span>
              </button>
              {!isClosed && (kind === "webview" ? <WebviewSection viewId={id} title={name} /> : <div className="side-scroll"><Children viewId={id} depth={0} version={views[id]?.version ?? 0} /></div>)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
