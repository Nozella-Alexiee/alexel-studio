// Tampilan notebook .ipynb: sel kode (CodeMirror) & markdown, output (teks, HTML tersanitasi,
// gambar, error), jalankan lewat kernel Jupyter lokal. Isi notebook tetap dokumen teks biasa di
// editor: setiap perubahan menulis ulang JSON (Mod+S menyimpan, Kode ⇄ Notebook lewat toggle).

import DOMPurify from "dompurify";
import { marked } from "marked";
import { ArrowDown, ArrowUp, ChevronsDown, Code2, Eraser, FileText, Play, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { runInTerminal } from "../app/run";
import { IconButton, Spinner } from "../components/ui";
import { MiniEditor } from "../db/MiniEditor";
import * as docs from "../editor/documents";
import { api, openExternal } from "../lib/ipc";

const isWin = navigator.userAgent.includes("Windows");
import { dirname } from "../lib/paths";
import { toast, useStore } from "../state/store";
import { tl } from "../i18n";
import { ensureKernel, interruptKernel, NOTEBOOK_CLOSED, restartKernel, runCell, useKernels } from "./kernel";
import { appendOutput, newId, parseNotebook, serializeNotebook, stripAnsi, textOf, type NbCell, type NbOutput, type Notebook } from "./model";

const md = (s: string) => DOMPurify.sanitize(marked.parse(s, { async: false, gfm: true }) as string, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button", "script", "iframe"], FORBID_ATTR: ["style"] });
const html = (s: string) => DOMPurify.sanitize(s, { USE_PROFILES: { html: true, svg: true }, FORBID_TAGS: ["script", "iframe", "form", "input", "button"] });

/** Tautan di markdown/HTML output: http(s)/mailto dibuka di browser sistem; tautan relatif/lain tidak boleh menavigasi jendela aplikasi. */
const onLinkClick = (e: React.MouseEvent) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (/^(https?:|mailto:)/i.test(href)) void openExternal(href);
};

let pyLang: Promise<import("@codemirror/state").Extension> | null = null;
const pythonLang = () => (pyLang ??= import("@codemirror/lang-python").then((m) => m.python()));
let mdLang: Promise<import("@codemirror/state").Extension> | null = null;
const markdownLang = () => (mdLang ??= import("@codemirror/lang-markdown").then((m) => m.markdown()));

function Output({ o }: { o: NbOutput }) {
  if (o.output_type === "stream") return <pre className={`nb-stream ${o.name === "stderr" ? "is-err" : ""}`}>{stripAnsi(textOf(o.text))}</pre>;
  if (o.output_type === "error") return <pre className="nb-stream is-err">{stripAnsi((o.traceback ?? []).join("\n") || `${o.ename}: ${o.evalue}`)}</pre>;
  const d = o.data ?? {};
  const t = (k: string) => textOf(d[k]);
  if (d["image/png"]) return <img className="nb-img" alt="" src={`data:image/png;base64,${t("image/png").replace(/\s/g, "")}`} />;
  if (d["image/jpeg"]) return <img className="nb-img" alt="" src={`data:image/jpeg;base64,${t("image/jpeg").replace(/\s/g, "")}`} />;
  if (d["image/svg+xml"]) return <img className="nb-img" alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(t("image/svg+xml"))}`} />;
  if (d["text/html"]) return <div className="nb-html" dangerouslySetInnerHTML={{ __html: html(t("text/html")) }} />;
  if (d["text/markdown"]) return <div className="nb-md" dangerouslySetInnerHTML={{ __html: md(t("text/markdown")) }} />;
  if (d["application/json"]) return <pre className="nb-stream">{JSON.stringify(d["application/json"], null, 2)}</pre>;
  if (d["text/plain"]) return <pre className="nb-stream">{stripAnsi(t("text/plain"))}</pre>;
  return <div className="hint nb-stream">{tl("(output {types} tidak didukung)", { types: Object.keys(d).join(", ") })}</div>;
}

function Cell({ cell, index, selected, running, lang, mdl, onSelect, onChange, onRun, onRunNext, onMove, onDelete, onToggle, onInsert }: {
  cell: NbCell;
  index: number;
  selected: boolean;
  running: boolean;
  lang: import("@codemirror/state").Extension;
  mdl: import("@codemirror/state").Extension;
  onSelect: () => void;
  onChange: (src: string) => void;
  onRun: () => void;
  onRunNext: () => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onToggle: () => void;
  onInsert: (type: "code" | "markdown") => void;
}) {
  const [editingMd, setEditingMd] = useState(!cell.source && cell.cell_type === "markdown");
  const isCode = cell.cell_type === "code";
  const showEditor = isCode || editingMd || cell.cell_type === "raw";
  return (
    <div className={`nb-cell ${selected ? "is-sel" : ""} is-${cell.cell_type}`} onMouseDown={onSelect} data-cell={cell.id}>
      <div className="nb-gutter">
        {isCode ? (
          running ? (
            <Spinner size={12} />
          ) : (
            <button className="nb-run" onClick={onRun} aria-label={tl("Jalankan sel {n}", { n: index + 1 })} title={tl("Jalankan (Mod+Enter) · Shift+Enter = jalankan & lanjut")}>
              <Play size={12} />
            </button>
          )
        ) : null}
        {isCode && <span className="nb-count">[{running ? "*" : cell.execution_count ?? " "}]</span>}
      </div>
      <div className="nb-body">
        <div className="nb-cell-tools">
          <IconButton label={isCode ? tl("Jadikan markdown") : tl("Jadikan kode")} onClick={onToggle}>
            {isCode ? <FileText size={12} /> : <Code2 size={12} />}
          </IconButton>
          <IconButton label={tl("Naikkan sel")} onClick={() => onMove(-1)}>
            <ArrowUp size={12} />
          </IconButton>
          <IconButton label={tl("Turunkan sel")} onClick={() => onMove(1)}>
            <ArrowDown size={12} />
          </IconButton>
          <IconButton label={tl("Hapus sel")} onClick={onDelete}>
            <Trash2 size={12} />
          </IconButton>
        </div>
        {showEditor ? (
          <MiniEditor
            key={cell.id + (editingMd ? "e" : "")}
            className="nb-editor"
            initial={cell.source}
            language={isCode ? lang : mdl}
            numbers={false}
            autoFocus={!isCode && editingMd}
            onFocus={onSelect}
            onChange={onChange}
            onRun={() => (isCode ? onRun() : setEditingMd(false))}
            onRunNext={() => (isCode ? onRunNext() : (setEditingMd(false), onRunNext()))}
            placeholder={isCode ? tl("Kode…") : tl("Markdown… (Shift+Enter untuk tampilkan)")}
          />
        ) : (
          <div className="nb-md" onDoubleClick={() => setEditingMd(true)} title={tl("Klik ganda untuk mengedit")} dangerouslySetInnerHTML={{ __html: md(cell.source) || `<p class="hint">${tl("Sel markdown kosong — klik ganda untuk mengedit")}</p>` }} />
        )}
        {isCode && (cell.outputs?.length ?? 0) > 0 && (
          <div className="nb-outputs">
            {cell.outputs!.map((o, i) => (
              <Output key={i} o={o} />
            ))}
          </div>
        )}
        <div className="nb-insert">
          <button onClick={() => onInsert("code")}>
            <Plus size={11} /> {tl("Kode")}
          </button>
          <button onClick={() => onInsert("markdown")}>
            <Plus size={11} /> Markdown
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotebookView({ path }: { path: string }) {
  const root = useStore((s) => s.root) ?? dirname(path);
  const kernel = useKernels((s) => s.byPath[path]);
  const [nb, setNb] = useState<Notebook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [lang, setLang] = useState<import("@codemirror/state").Extension>([]);
  const [mdl, setMdl] = useState<import("@codemirror/state").Extension>([]);
  const [specs, setSpecs] = useState<{ name: string; display: string }[]>([]);
  const nbRef = useRef<Notebook | null>(null);
  const lastText = useRef<string>("");
  const writeTimer = useRef<number>(0);

  useEffect(() => {
    void pythonLang().then(setLang);
    void markdownLang().then(setMdl);
  }, []);
  const load = () => {
    const text = docs.currentText(path) ?? "";
    if (text === lastText.current) return;
    try {
      const n = parseNotebook(text);
      lastText.current = text;
      nbRef.current = n;
      setNb(n);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
    const off = docs.onDocTextChange((p) => p === path && load());
    return () => void off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => () => {
    clearTimeout(writeTimer.current);
  }, []);

  const commit = (n: Notebook, immediate = false) => {
    nbRef.current = n;
    setNb(n);
    clearTimeout(writeTimer.current);
    const write = () => {
      const text = serializeNotebook(nbRef.current!);
      lastText.current = text;
      docs.editDocumentText(path, text);
    };
    if (immediate) write();
    else writeTimer.current = window.setTimeout(write, 250);
  };
  const patchCell = (id: string, f: (c: NbCell) => NbCell, immediate = true) => {
    const cur = nbRef.current;
    if (!cur) return;
    commit({ ...cur, cells: cur.cells.map((c) => (c.id === id ? f(c) : c)) }, immediate);
  };

  const kname = (nb?.metadata?.kernelspec as { name?: string } | undefined)?.name ?? null;
  const stopRunning = (id: string) =>
    setRunning((r) => {
      const n = new Set(r);
      n.delete(id);
      return n;
    });
  /** Jalankan satu sel; selesai saat kernel membalas execute_reply. Hasil: berhasil atau tidak. */
  const run = (cell: NbCell): Promise<boolean> =>
    new Promise((resolve) => {
      if (cell.cell_type !== "code" || !cell.source.trim()) return resolve(true);
      setRunning((r) => new Set(r).add(cell.id));
      patchCell(cell.id, (c) => ({ ...c, outputs: [] }));
      runCell(path, root, kname, cell.id, cell.source, (e) => {
        if (e.type === "output") patchCell(cell.id, (c) => ({ ...c, outputs: appendOutput(c.outputs ?? [], e.output) }), false);
        else if (e.type === "clear") patchCell(cell.id, (c) => ({ ...c, outputs: [] }), false);
        else if (e.type === "count") patchCell(cell.id, (c) => ({ ...c, execution_count: e.count }), false);
        else if (e.type === "done") {
          stopRunning(cell.id);
          if (e.count !== undefined) patchCell(cell.id, (c) => ({ ...c, execution_count: e.count }));
          resolve(e.status === "ok");
        }
      }).catch((err: Error) => {
        stopRunning(cell.id);
        if (err.message !== "JUPYTER_MISSING" && err.message !== NOTEBOOK_CLOSED) toast(err.message, "error");
        resolve(false);
      });
    });
  const runAll = async () => {
    for (const c of nbRef.current?.cells ?? []) {
      // Berhenti di sel yang gagal, seperti "Run All" di Jupyter.
      if (!(await run(nbRef.current!.cells.find((x) => x.id === c.id) ?? c))) break;
    }
  };
  useEffect(() => {
    if (kernel?.status === "idle" && !specs.length) void api.jupyterSpecs(root).then((r) => setSpecs(r.specs)).catch(() => {});
  }, [kernel?.status, root, specs.length]);

  if (error)
    return (
      <div className="pad">
        <pre className="db-error-box">{error}</pre>
      </div>
    );
  if (!nb)
    return (
      <div className="pad">
        <Spinner />
      </div>
    );
  const insertAt = (i: number, type: "code" | "markdown") => {
    const cell: NbCell = type === "code" ? { id: newId(), cell_type: "code", source: "", metadata: {}, outputs: [], execution_count: null } : { id: newId(), cell_type: "markdown", source: "", metadata: {} };
    const cells = [...nb.cells];
    cells.splice(i, 0, cell);
    commit({ ...nb, cells }, true);
    setSel(i);
    setTimeout(() => (document.querySelector(`[data-cell="${cell.id}"] .cm-content`) as HTMLElement | null)?.focus(), 50);
  };
  const missing = kernel?.status === "error" && kernel.error === "JUPYTER_MISSING";
  const installCmd = isWin ? "if not exist .venv py -m venv .venv & .venv\\Scripts\\python -m pip install jupyter_server ipykernel" : "[ -x .venv/bin/python ] || python3 -m venv .venv; .venv/bin/python -m pip install jupyter_server ipykernel";
  const status = kernel?.status ?? "none";
  return (
    <div className="nb">
      <div className="db-toolbar nb-toolbar">
        <button className="btn btn-sm btn-primary" onClick={() => void runAll()}>
          <ChevronsDown size={12} /> {tl("Jalankan semua")}
        </button>
        <IconButton label={tl("Interupsi kernel")} onClick={() => void interruptKernel(path).catch((e: Error) => toast(e.message, "error"))} disabled={status !== "busy"}>
          <Square size={12} />
        </IconButton>
        <IconButton label={tl("Mulai ulang kernel")} onClick={() => void restartKernel(path).catch((e: Error) => toast(e.message, "error"))} disabled={!kernel?.id}>
          <RotateCcw size={12} />
        </IconButton>
        <IconButton label={tl("Hapus semua output")} onClick={() => commit({ ...nb, cells: nb.cells.map((c) => (c.cell_type === "code" ? { ...c, outputs: [], execution_count: null } : c)) }, true)}>
          <Eraser size={12} />
        </IconButton>
        <span className="spacer" />
        <span className={`nb-kstatus is-${status}`} title={kernel?.error}>
          <span className="nb-kdot" />
          {status === "none" ? tl("Kernel belum jalan") : status === "starting" ? tl("Memulai kernel…") : status === "busy" ? tl("Sibuk") : status === "idle" ? tl("Siap") : status === "dead" ? tl("Kernel mati") : tl("Gagal")}
        </span>
        <select className="input select db-copy" value={kname ?? ""} aria-label={tl("Kernel")} onChange={(e) => {
          const s = specs.find((x) => x.name === e.target.value);
          if (s) commit({ ...nb, metadata: { ...nb.metadata, kernelspec: { name: s.name, display_name: s.display, language: "python" } } }, true);
        }} onFocus={() => !specs.length && void api.jupyterSpecs(root).then((r) => setSpecs(r.specs)).catch(() => {})}>
          <option value={kname ?? ""}>{(nb.metadata.kernelspec as { display_name?: string } | undefined)?.display_name ?? kname ?? "Python 3"}</option>
          {specs.filter((s) => s.name !== kname).map((s) => (
            <option key={s.name} value={s.name}>
              {s.display}
            </option>
          ))}
        </select>
        {status === "none" && (
          <button className="btn btn-sm" onClick={() => void ensureKernel(path, root, kname).catch(() => {})}>
            {tl("Mulai kernel")}
          </button>
        )}
      </div>
      {missing && (
        <div className="env-warn">
          <span>{tl("Jupyter belum terpasang. Notebook tetap bisa dibaca & diedit; untuk menjalankan sel, pasang jupyter_server + ipykernel (disarankan di .venv project).")}</span>
          <button className="btn btn-sm" onClick={() => void runInTerminal(installCmd, "pip")}>
            {tl("Pasang di terminal")}
          </button>
        </div>
      )}
      {kernel?.status === "error" && !missing && kernel.error && <pre className="db-error-box">{kernel.error}</pre>}
      <div className="nb-cells" onClick={onLinkClick}>
        {nb.cells.map((c, i) => (
          <Cell
            key={c.id}
            cell={c}
            index={i}
            selected={sel === i}
            running={running.has(c.id)}
            lang={lang}
            mdl={mdl}
            onSelect={() => setSel(i)}
            onChange={(src) => patchCell(c.id, (x) => ({ ...x, source: src }), false)}
            onRun={() => void run(nbRef.current!.cells.find((x) => x.id === c.id)!)}
            onRunNext={() => {
              const cur = nbRef.current!.cells.find((x) => x.id === c.id)!;
              void run(cur);
              const idx = nbRef.current!.cells.findIndex((x) => x.id === c.id);
              if (idx === nbRef.current!.cells.length - 1) insertAt(idx + 1, "code");
              else {
                setSel(idx + 1);
                setTimeout(() => (document.querySelector(`[data-cell="${nbRef.current!.cells[idx + 1].id}"] .cm-content`) as HTMLElement | null)?.focus(), 30);
              }
            }}
            onMove={(d) => {
              const j = i + d;
              if (j < 0 || j >= nb.cells.length) return;
              const cells = [...nb.cells];
              [cells[i], cells[j]] = [cells[j], cells[i]];
              commit({ ...nb, cells }, true);
              setSel(j);
            }}
            onDelete={() => commit({ ...nb, cells: nb.cells.filter((x) => x.id !== c.id) }, true)}
            onToggle={() => patchCell(c.id, (x) => (x.cell_type === "code" ? { id: x.id, cell_type: "markdown", source: x.source, metadata: x.metadata } : { id: x.id, cell_type: "code", source: x.source, metadata: x.metadata, outputs: [], execution_count: null }))}
            onInsert={(t) => insertAt(i + 1, t)}
          />
        ))}
        {!nb.cells.length && (
          <div className="nb-insert is-shown">
            <button onClick={() => insertAt(0, "code")}>
              <Plus size={11} /> {tl("Kode")}
            </button>
            <button onClick={() => insertAt(0, "markdown")}>
              <Plus size={11} /> Markdown
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
