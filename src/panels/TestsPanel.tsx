// Test Explorer: pohon test dari ekstensi (vscode.tests), jalankan per item / semua, lihat hasil.

import { CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Circle, FlaskConical, Play, RefreshCw, Square, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import * as A from "../app/actions";
import { Empty, IconButton, Spinner } from "../components/ui";
import { uriToPath } from "../editor/lsp";
import { toast } from "../state/store";
import { errMsg } from "../lib/ipc";
import { aggregate, cancelTests, refreshTests, resolveTests, runTests, useTests, type TestCtl, type TestNode, type TestState } from "../exthost/tests";
import { tl } from "../i18n";

function StateIcon({ state }: { state?: TestState }) {
  if (state === "running" || state === "queued") return <Spinner size={12} />;
  if (state === "passed") return <CheckCircle2 size={13} className="tone-success-fg" aria-label={tl("Lulus")} />;
  if (state === "failed" || state === "errored") return <XCircle size={13} className="tone-danger-fg" aria-label={tl("Gagal")} />;
  if (state === "skipped") return <CircleSlash size={13} className="hint" aria-label={tl("Dilewati")} />;
  return <Circle size={12} className="hint" aria-hidden />;
}

const run = (ctl: string, keys: string[]) => void runTests(ctl, keys).catch((e) => toast(errMsg(e), "error"));

function Node({ ctl, node, depth }: { ctl: string; node: TestNode; depth: number }) {
  const results = useTests((s) => s.results);
  const [open, setOpen] = useState(depth < 1);
  const expandable = node.children.length > 0 || node.canResolveChildren;
  const state = aggregate(node, results);
  const res = results[node.key];
  const toggle = () => {
    if (!open && node.canResolveChildren && !node.children.length) void resolveTests(node.key);
    setOpen((o) => !o);
  };
  const reveal = () => {
    if (!node.uri) return;
    void A.openFile(uriToPath(node.uri), node.range ? { line: node.range.s.l + 1, col: node.range.s.c + 1 } : {});
  };
  return (
    <>
      <div className={`tree-row test-row ${state ? `is-${state}` : ""}`} style={{ paddingLeft: 8 + depth * 12 }} title={res?.message ?? node.error ?? node.label}>
        <button className="tree-chev" onClick={toggle} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")} disabled={!expandable}>
          {expandable ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </button>
        <StateIcon state={node.busy ? "running" : state} />
        <button className="test-label" onClick={reveal} onDoubleClick={() => run(ctl, [node.key])}>
          {node.label}
          {node.description && <span className="ext-tree-desc">{node.description}</span>}
          {res?.duration !== undefined && <span className="ext-tree-desc">{Math.round(res.duration)} ms</span>}
        </button>
        <IconButton label={tl("Jalankan {name}", { name: node.label })} onClick={() => run(ctl, [node.key])}>
          <Play size={12} />
        </IconButton>
      </div>
      {open && node.children.map((c) => <Node key={c.key} ctl={ctl} node={c} depth={depth + 1} />)}
      {(open || !expandable) && res?.message && (state === "failed" || state === "errored") && <pre className="test-message" style={{ marginLeft: 28 + depth * 12 }}>{res.message}</pre>}
    </>
  );
}

function Controller({ c }: { c: TestCtl }) {
  return (
    <section>
      <div className="git-section-head">
        <span>{c.label}</span>
        <span className="spacer" />
        <IconButton label={tl("Muat ulang test")} onClick={() => void refreshTests(c.id)}>
          <RefreshCw size={12} />
        </IconButton>
        <IconButton label={tl("Jalankan semua")} onClick={() => run(c.id, [])} disabled={!c.profiles.length}>
          <Play size={12} />
        </IconButton>
      </div>
      {c.items.length ? c.items.map((n) => <Node key={n.key} ctl={c.id} node={n} depth={0} />) : <div className="hint pad-x">{tl("Belum ada test yang ditemukan.")}</div>}
    </section>
  );
}

export default function TestsPanel() {
  const controllers = useTests((s) => s.controllers);
  const runs = useTests((s) => s.runs);
  const results = useTests((s) => s.results);
  useEffect(() => {
    void resolveTests(null);
  }, []);
  const vals = Object.values(results);
  const passed = vals.filter((r) => r.state === "passed").length;
  const failed = vals.filter((r) => r.state === "failed" || r.state === "errored").length;
  if (!controllers.length) return <Empty icon={<FlaskConical size={24} />} title={tl("Tests")}>{tl("Belum ada penyedia test. Pasang dan percayai ekstensi test (mis. Jest, Vitest, Python) untuk melihat test di sini.")}</Empty>;
  return (
    <div className="tests-panel">
      <div className="side-head">
        <span className="side-title">{tl("Tests")}</span>
        <span className="hint">{vals.length ? tl("{p} lulus · {f} gagal", { p: passed, f: failed }) : ""}</span>
        <span className="spacer" />
        {runs > 0 ? (
          <IconButton label={tl("Hentikan test")} tone="danger" onClick={cancelTests}>
            <Square size={12} />
          </IconButton>
        ) : (
          <IconButton label={tl("Jalankan semua test")} onClick={() => controllers.forEach((c) => c.profiles.length && run(c.id, []))}>
            <Play size={13} />
          </IconButton>
        )}
      </div>
      <div className="side-scroll">
        {controllers.map((c) => (
          <Controller key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}
