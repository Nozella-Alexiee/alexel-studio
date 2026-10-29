// Isi panel bawah: Masalah, Port & proses, Papan TODO.

import { AlertCircle, AlertTriangle, ExternalLink, Info, RefreshCw, Square, Wand2, Zap } from "lucide-react";
import { CrabMascot } from "../components/CrabMascot";
import { useEffect, useMemo, useState } from "react";
import * as A from "../app/actions";
import { FileIcon } from "../components/FileIcon";
import { Empty, IconButton, Segmented, Spinner } from "../components/ui";
import { api, errMsg, openExternal } from "../lib/ipc";
import { relative } from "../lib/paths";
import { openCopyMenu } from "../components/textMenu";
import type { ListeningPort, TodoItem } from "../lib/types";
import { confirmDialog, isSaver, toast, useStore } from "../state/store";
import { refreshTodos } from "./todoData";
import { tl } from "../i18n";

// ---------------- Masalah ----------------

export function ProblemsPanel() {
  const problems = useStore((s) => s.problems);
  const root = useStore((s) => s.root) ?? "";
  const files = Object.entries(problems).filter(([, l]) => l.length);
  if (!files.length) return <Empty icon={<Zap size={22} />} title={tl("Tidak ada masalah")}>{tl("Error sintaks dari berkas yang terbuka akan muncul di sini.")}</Empty>;
  return (
    <div className="problems">
      {files.map(([path, list]) => (
        <div key={path} className="prob-file">
          <div className="prob-file-head">
            <FileIcon filename={path} size={14} />
            <span>{relative(root, path)}</span>
            <span className="count-badge">{list.length}</span>
          </div>
          {list.map((p, i) => (
            <div key={i} className={`prob-row sev-${p.severity}`} onContextMenu={(e) => openCopyMenu(e, [{ label: tl("Salin pesan"), text: p.message }, { label: tl("Salin lokasi dan pesan"), text: `${relative(root, path)}:${p.line}:${p.col} ${p.message}` }])}>
              <button className="prob-main" onClick={() => void A.openFile(path, { line: p.line, col: p.col })}>
                {p.severity === "error" ? <AlertCircle size={14} aria-label="Error" /> : p.severity === "warning" ? <AlertTriangle size={14} aria-label={tl("Peringatan")} /> : <Info size={14} aria-label="Info" />}
                <span className="prob-msg">{p.message}</span>
                <span className="prob-loc">
                  {p.source} · {p.line}:{p.col}
                </span>
              </button>
              <button className="btn btn-sm btn-ghost prob-ask" onClick={() => void import("../claude/claude").then((m) => m.explainProblem(path, p))} title={tl("Minta agen AI menjelaskan dan memperbaiki")}>
                <CrabMascot size={14} /> {tl("Jelaskan")}
              </button>
              <button className="btn btn-sm btn-ghost prob-ask" onClick={() => void import("../editor/fixWithAi").then((m) => m.fixProblem(path, p))} title={tl("Perbaiki dengan AI")}>
                <Wand2 size={13} /> {tl("Perbaiki")}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------- Port & proses ----------------

export function PortsPanel() {
  const [ports, setPorts] = useState<ListeningPort[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const load = async () => {
    setBusy(true);
    try {
      setPorts(await api.ports());
      setLoadErr(null);
    } catch (e) {
      // Ditampilkan di panel, bukan toast: pemanggilan ini diulang tiap beberapa detik.
      setLoadErr(errMsg(e));
      setPorts([]);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), isSaver() ? 30000 : 8000);
    return () => clearInterval(t);
  }, []);

  const stop = async (p: ListeningPort, force = false) => {
    if (!(await confirmDialog(tl("Hentikan {name} (port {port})?", { name: p.process, port: p.port }), p.command || `PID ${p.pid}`, force ? tl("Paksa berhenti") : tl("Hentikan"), true))) return;
    try {
      await api.kill(p.pid, force);
      toast(tl("Proses {pid} dihentikan", { pid: p.pid }), "success");
      setTimeout(() => void load(), 600);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  return (
    <div className="ports">
      <div className="panel-toolbar">
        <span className="hint">{tl("Server yang sedang mendengarkan port TCP milikmu.")}</span>
        <IconButton label={tl("Muat ulang")} onClick={() => void load()}>
          {busy ? <Spinner size={12} /> : <RefreshCw size={13} />}
        </IconButton>
      </div>
      {ports === null ? (
        <div className="pad">
          <Spinner />
        </div>
      ) : loadErr ? (
        <Empty title={tl("Daftar port tidak bisa dibaca")}>{loadErr}</Empty>
      ) : ports.length === 0 ? (
        <Empty title={tl("Tidak ada port terbuka")}>{tl("Jalankan dev server (mis. npm run dev), lalu muncul di sini.")}</Empty>
      ) : (
        <table className="ports-table selectable">
          <thead>
            <tr>
              <th>Port</th>
              <th>{tl("Proses")}</th>
              <th>{tl("Alamat")}</th>
              <th>{tl("Perintah")}</th>
              <th aria-label={tl("Aksi")} />
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => (
              <tr key={`${p.port}-${p.pid}`}>
                <td className="mono strong">{p.port}</td>
                <td>
                  {p.process} <span className="hint">#{p.pid}</span>
                </td>
                <td className="mono hint">{p.address}</td>
                <td className="mono ellipsis" title={p.command}>
                  {p.command}
                </td>
                <td className="row-actions">
                  <IconButton label={tl("Buka {url}", { url: `http://localhost:${p.port}` })} onClick={(e) => (e.altKey ? void openExternal(`http://localhost:${p.port}`) : void import("../browser/state").then((m) => m.openBrowser(`http://localhost:${p.port}`)))}>
                    <ExternalLink size={13} />
                  </IconButton>
                  <IconButton label={tl("Hentikan")} tone="danger" onClick={() => void stop(p)}>
                    <Square size={12} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Papan TODO ----------------

const TAGS = ["TODO", "FIXME", "BUG", "HACK", "NOTE", "XXX"];

export function TodoPanel() {
  const todos = useStore((s) => s.todos);
  const root = useStore((s) => s.root);
  const [view, setView] = useState<"board" | "list">("board");
  useEffect(() => {
    if (root && todos === null) void refreshTodos();
  }, [root, todos]);
  const groups = useMemo(() => {
    const m: Record<string, TodoItem[]> = {};
    for (const t of todos ?? []) (m[t.tag] ??= []).push(t);
    return TAGS.filter((t) => m[t]?.length).map((t) => [t, m[t]] as const);
  }, [todos]);
  if (!root) return <Empty title={tl("Buka folder dulu")} />;
  if (todos === null) return <div className="pad"><Spinner /></div>;
  if (!todos.length) return <Empty title={tl("Tidak ada TODO")}>{tl("Tulis komentar seperti")} <code>// TODO: rapikan</code> {tl("atau")} <code># FIXME</code> {tl("dan muncul di sini.")}</Empty>;
  const Card = ({ t }: { t: TodoItem }) => (
    <button className="todo-card" onClick={() => void A.openFile(t.path, { line: t.line })}>
      <span className="todo-text">{t.text || <em className="hint">(tanpa keterangan)</em>}</span>
      <span className="todo-loc">
        {t.rel}:{t.line}
      </span>
    </button>
  );
  return (
    <div className="todos">
      <div className="panel-toolbar">
        <span className="hint">{tl("{n} catatan di project", { n: todos.length })}</span>
        <Segmented label={tl("Tampilan")} value={view} onChange={setView} options={[{ id: "board", label: tl("Papan") }, { id: "list", label: tl("Daftar") }]} />
        <IconButton label={tl("Pindai ulang")} onClick={() => void refreshTodos()}>
          <RefreshCw size={13} />
        </IconButton>
      </div>
      {view === "board" ? (
        <div className="todo-board">
          {groups.map(([tag, list]) => (
            <section key={tag} className={`todo-col tag-${tag}`}>
              <h3 className="todo-col-head">
                {tag} <span className="count-badge">{list.length}</span>
              </h3>
              {list.slice(0, 200).map((t, i) => (
                <Card key={i} t={t} />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="todo-list">
          {todos.map((t, i) => (
            <button key={i} className="todo-line" onClick={() => void A.openFile(t.path, { line: t.line })}>
              <span className={`todo-tag tag-${t.tag}`}>{t.tag}</span>
              <span className="todo-text">{t.text}</span>
              <span className="todo-loc">
                {t.rel}:{t.line}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
