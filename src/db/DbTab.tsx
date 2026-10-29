// Tab database: grid tabel (paginasi, urut, filter, edit sel, tambah/hapus baris), konsol query (dengan
// "Tanya data" AI, Jelaskan, Optimalkan, riwayat), dan diagram ER.

import type { EditorView } from "@codemirror/view";
import { ChevronLeft, ChevronRight, Download, History, Lightbulb, Network, Play, Plus, RefreshCw, Sparkles, Square, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DbSchema, QueryResult } from "../../electron/db/types";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg, pickSavePath } from "../lib/ipc";
import { confirmDialog, toast } from "../state/store";
import { tl } from "../i18n";
import { askData, cancelAi, explainQuery, extractCode, optimizeQuery } from "./ai";
import { ER, erLayout } from "./er";
import { MiniEditor, type MiniEditorApi } from "./MiniEditor";
import { parseDbTab, pendingAi, type DbTabRef } from "./open";
import { ResultGrid, showCell } from "./ResultGrid";
import { ResultActions, ResultSummary } from "./ResultsPanel";
import { queryLanguage, statementAt } from "./sqlText";
import { cancelQuery, connById, isSql, loadSchema, refreshConns, runQuery, useDb, type ResultEntry } from "./state";

const PAGE = 200;

function useConn(id: string) {
  const conn = useDb((s) => s.conns.find((c) => c.id === id));
  useEffect(() => {
    if (!useDb.getState().conns.length) void refreshConns();
  }, []);
  return conn;
}

function TableView({ r }: { r: DbTabRef }) {
  const conn = useConn(r.conn);
  const schemas = useDb((s) => s.schemas[r.conn]);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ col: string; desc: boolean } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [data, setData] = useState<(QueryResult & { total: number | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<Record<string, string> | null>(null);
  const table = useMemo(() => schemas?.find((s) => r.schema === null || s.name === r.schema)?.tables.find((t) => t.name === r.table), [schemas, r]);
  const sql = conn ? isSql(conn.kind) : false;
  const pk = table?.columns.filter((c) => c.pk).map((c) => c.name) ?? [];
  // Urutan stabil per PK supaya baris tidak berpindah setelah diedit (UPDATE di Postgres memindah baris fisik).
  const pkFirst = sql ? pk[0] : undefined;
  const editable = sql && !conn?.readOnly && pk.length > 0 && table?.kind === "table";

  useEffect(() => {
    void loadSchema(r.conn);
  }, [r.conn]);
  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api.dbBrowse(r.conn, { schema: r.schema, table: r.table!, offset: page * PAGE, limit: PAGE, orderBy: sort?.col ?? pkFirst ?? null, desc: sort?.desc, filters }));
    } catch (e) {
      setError(tl(errMsg(e)));
    } finally {
      setBusy(false);
    }
  }, [r, page, sort, filters, pkFirst]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!conn) return <Empty title={tl("Koneksi tidak ditemukan")} />;
  const cols = data?.columns ?? [];
  const keyOf = (row: unknown[]) => Object.fromEntries(pk.map((k) => [k, row[cols.findIndex((c) => c.name === k)]]));
  const edit = async (ri: number, ci: number, value: string | null) => {
    const row = data!.rows[ri];
    const col = cols[ci].name;
    if (!(await confirmDialog(tl("Simpan perubahan?"), tl("Ubah {col} pada 1 baris {table}.", { col, table: r.table! }), tl("Simpan"))))
      return;
    try {
      await api.dbEdit(r.conn, { schema: r.schema, table: r.table!, key: keyOf(row), values: { [col]: value }, op: "update" });
      void load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const del = async (ri: number) => {
    const row = data!.rows[ri];
    const desc = pk.map((k) => `${k} = ${showCell(row[cols.findIndex((c) => c.name === k)])}`).join(", ");
    if (!(await confirmDialog(tl("Hapus baris?"), `${r.table} · ${desc}`, tl("Hapus"), true))) return;
    try {
      await api.dbEdit(r.conn, { schema: r.schema, table: r.table!, key: keyOf(row), op: "delete" });
      void load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const insert = async () => {
    const values = Object.fromEntries(Object.entries(adding ?? {}).filter(([, v]) => v !== ""));
    try {
      await api.dbEdit(r.conn, { schema: r.schema, table: r.table!, key: {}, values, op: "insert" });
      setAdding(null);
      void load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const exportAll = async (format: "csv" | "json") => {
    const path = await pickSavePath(`${r.table}.${format}`, [{ name: format.toUpperCase(), extensions: [format] }]);
    if (!path) return;
    const q = (n: string) => (conn.kind === "mysql" ? `\`${n.replace(/`/g, "``")}\`` : `"${n.replace(/"/g, '""')}"`);
    const text = sql ? `SELECT * FROM ${r.schema && conn.kind !== "sqlite" ? `${q(r.schema)}.` : ""}${q(r.table!)}` : conn.kind === "mongodb" ? `db.getCollection(${JSON.stringify(r.table)}).find({})` : `@key ${r.table}`;
    try {
      const { rows } = await api.dbExport(r.conn, text, format, path);
      toast(tl("{n} baris diekspor", { n: rows.toLocaleString() }), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const total = data?.total ?? null;
  const from = page * PAGE;
  return (
    <div className="db-tab">
      <div className="db-toolbar">
        <strong className="db-title">{r.schema ? `${r.schema}.` : ""}{r.table}</strong>
        {data?.message && <span className="hint">{data.message}</span>}
        <span className="hint">
          {data && (data.rows.length ? `${(from + 1).toLocaleString()}–${(from + data.rows.length).toLocaleString()}` : "0")}
          {total !== null && ` / ${total.toLocaleString()}`}
          {data && ` · ${data.ms} ms`}
        </span>
        <span className="spacer" />
        {busy && <Spinner size={12} />}
        {sql && (
          <>
            <IconButton label={tl("Halaman sebelumnya")} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft size={13} />
            </IconButton>
            <IconButton label={tl("Halaman berikutnya")} onClick={() => setPage((p) => p + 1)} disabled={!data || (total !== null ? from + PAGE >= total : data.rows.length < PAGE)}>
              <ChevronRight size={13} />
            </IconButton>
          </>
        )}
        {editable && (
          <IconButton label={tl("Tambah baris")} onClick={() => setAdding({})}>
            <Plus size={13} />
          </IconButton>
        )}
        <IconButton label={tl("Muat ulang")} onClick={() => void load()}>
          <RefreshCw size={13} />
        </IconButton>
        <select className="input select db-copy" value="" aria-label={tl("Ekspor")} onChange={(e) => {
          if (e.target.value) void exportAll(e.target.value as "csv" | "json");
          e.target.value = "";
        }}>
          <option value="">{tl("Ekspor…")}</option>
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
      </div>
      {!editable && sql && table?.kind === "table" && !pk.length && <div className="db-note">{tl("Tabel tanpa primary key: edit dari grid dinonaktifkan.")}</div>}
      {conn.readOnly && <div className="db-note">{tl("Koneksi read-only.")}</div>}
      {adding && table && (
        <div className="db-add">
          {table.columns.map((c) => (
            <label key={c.name} className="db-field">
              <span>
                {c.name} <small className="hint">{c.type}{c.pk ? " · PK" : ""}{c.default ? " · default" : ""}</small>
              </span>
              <input className="input" value={adding[c.name] ?? ""} placeholder={c.default ? String(c.default) : c.nullable ? "NULL" : ""} onChange={(e) => setAdding({ ...adding, [c.name]: e.target.value })} />
            </label>
          ))}
          <div className="db-add-actions">
            <button className="btn btn-sm" onClick={() => setAdding(null)}>
              {tl("Batal")}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => void insert()}>
              {tl("Sisipkan")}
            </button>
          </div>
        </div>
      )}
      {error ? (
        <pre className="db-error-box">{error}</pre>
      ) : data ? (
        <ResultGrid
          columns={data.columns}
          rows={data.rows}
          pk={pk}
          offset={from}
          sort={sort}
          onSort={sql ? (col) => setSort((s) => (s?.col === col ? (s.desc ? null : { col, desc: true }) : { col, desc: false })) : undefined}
          filters={filters}
          onFilter={sql ? (col, v) => (setPage(0), setFilters((f) => ({ ...f, [col]: v }))) : undefined}
          onEdit={editable ? (ri, ci, v) => void edit(ri, ci, v) : undefined}
          onDelete={editable ? (ri) => void del(ri) : undefined}
        />
      ) : (
        <div className="pad">
          <Spinner />
        </div>
      )}
    </div>
  );
}

const STARTER: Record<string, string> = {
  postgres: "SELECT now();\n",
  mysql: "SELECT NOW();\n",
  sqlite: "SELECT name FROM sqlite_master WHERE type = 'table';\n",
  mongodb: "db.runCommand({ listCollections: 1, nameOnly: true })\n",
  redis: "INFO server\n",
};

function ConsoleView({ r, tabId }: { r: DbTabRef; tabId: string }) {
  const conn = useConn(r.conn);
  const schemas = useDb((s) => s.schemas[r.conn]);
  const results = useDb((s) => s.results);
  const [lang, setLang] = useState<Awaited<ReturnType<typeof queryLanguage>>>([]);
  const [resKey, setResKey] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(() => pendingAi.delete(tabId));
  const [question, setQuestion] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hist, setHist] = useState<{ text: string; at: number; ok: boolean }[] | null>(null);
  const ed = useRef<MiniEditorApi | null>(null);
  const storeKey = `alexel.db.console.${r.conn}`;
  const initial = useMemo(() => {
    try {
      return localStorage.getItem(storeKey) ?? "";
    } catch {
      return "";
    }
  }, [storeKey]);

  useEffect(() => {
    void loadSchema(r.conn);
  }, [r.conn]);
  useEffect(() => {
    if (conn) void queryLanguage(conn.kind, schemas).then(setLang);
  }, [conn?.kind, schemas]);
  if (!conn) return <Empty title={tl("Koneksi tidak ditemukan")} />;

  const replace = (q: string) => {
    const v = ed.current?.view;
    if (!v) return;
    const end = v.state.doc.length;
    const insert = (end && !v.state.doc.toString().endsWith("\n") ? "\n\n" : end ? "\n" : "") + q + "\n";
    v.dispatch({ changes: { from: end, insert }, selection: { anchor: end + insert.length - 1 - q.length, head: end + insert.length - 1 }, scrollIntoView: true });
    v.focus();
  };
  const current = (v: EditorView) => {
    const sel = v.state.selection.main;
    return sel.empty ? statementAt(v.state.doc.toString(), sel.head, conn.kind) : v.state.sliceDoc(sel.from, sel.to);
  };
  const run = async (v?: EditorView) => {
    const view = v ?? ed.current?.view;
    if (!view) return;
    const q = current(view).trim();
    if (!q) return;
    setNote(null);
    const before = useDb.getState().results[0]?.key;
    const p = runQuery(conn.id, q, { showPanel: false });
    const k = useDb.getState().results[0]?.key;
    if (k !== before) setResKey(k ?? null);
    await p;
  };
  const ai = async () => {
    if (!question.trim()) return;
    setAiBusy(true);
    try {
      const q = await askData(conn.id, question);
      if (q) {
        replace(q);
        setNote(tl("Query dari AI ditambahkan di bawah. Periksa dulu, lalu tekan Jalankan."));
      }
    } finally {
      setAiBusy(false);
    }
  };
  const explain = async (opt: boolean) => {
    const v = ed.current?.view;
    if (!v) return;
    const q = current(v).trim();
    if (!q) return toast(tl("Tulis atau pilih query dulu."));
    setAiBusy(true);
    try {
      const out = opt ? await optimizeQuery(conn.id, q) : await explainQuery(conn.id, q);
      if (out) setNote(out);
    } finally {
      setAiBusy(false);
    }
  };
  const e: ResultEntry | undefined = results.find((x) => x.key === resKey);

  return (
    <div className="db-tab db-console">
      <div className="db-toolbar">
        <span className={`db-kind-dot db-k-${conn.kind} ${conn.connected ? "is-on" : ""}`} />
        <strong className="db-title">{conn.name}</strong>
        {conn.env === "prod" && <span className="db-env db-env-prod">{tl("produksi")}</span>}
        {conn.readOnly && <span className="db-env">RO</span>}
        <span className="spacer" />
        <button className="btn btn-sm btn-primary" onClick={() => void run()} title={tl("Jalankan statement di kursor / seleksi (Mod+Enter)")}>
          <Play size={12} /> {tl("Jalankan")}
        </button>
        {e?.running && (
          <IconButton label={tl("Batalkan query")} onClick={() => void cancelQuery(conn.id)}>
            <Square size={12} />
          </IconButton>
        )}
        <IconButton label={tl("Tanya data dengan AI")} onClick={() => setAiOpen((o) => !o)}>
          <Sparkles size={13} />
        </IconButton>
        <IconButton label={tl("Jelaskan query (AI)")} onClick={() => void explain(false)} disabled={aiBusy}>
          <Lightbulb size={13} />
        </IconButton>
        <IconButton label={tl("Optimalkan query (AI)")} onClick={() => void explain(true)} disabled={aiBusy}>
          <Wand2 size={13} />
        </IconButton>
        <IconButton label={tl("Riwayat query")} onClick={() => void (hist ? setHist(null) : api.dbHistory(conn.id).then(setHist))}>
          <History size={13} />
        </IconButton>
      </div>
      {aiOpen && (
        <div className="db-ai">
          <Sparkles size={13} className="db-ai-ico" />
          <input className="input" autoFocus value={question} onChange={(ev) => setQuestion(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && void ai()} placeholder={tl("Tanya data, mis. “10 pelanggan dengan total belanja terbesar bulan ini”")} aria-label={tl("Pertanyaan untuk AI")} />
          {aiBusy ? (
            <IconButton label={tl("Batalkan")} onClick={() => (cancelAi(), setAiBusy(false))}>
              <X size={13} />
            </IconButton>
          ) : (
            <button className="btn btn-sm" onClick={() => void ai()} disabled={!question.trim()}>
              {tl("Buat query")}
            </button>
          )}
        </div>
      )}
      {aiBusy && !aiOpen && (
        <div className="db-note">
          <Spinner size={11} /> {tl("Agen AI sedang bekerja…")}
        </div>
      )}
      {hist && (
        <div className="db-history">
          {hist.length ? (
            hist.slice(0, 50).map((h) => (
              <button key={h.at} className={`db-history-item ${h.ok ? "" : "is-err"}`} onClick={() => (replace(h.text), setHist(null))} title={h.text}>
                <span className="hint">{new Date(h.at).toLocaleString()}</span> {h.text.replace(/\s+/g, " ").slice(0, 120)}
              </button>
            ))
          ) : (
            <div className="pad-x hint">{tl("Belum ada riwayat.")}</div>
          )}
        </div>
      )}
      <div className="db-console-split">
        <MiniEditor
          initial={initial || STARTER[conn.kind]}
          language={lang}
          onRun={(v) => void run(v)}
          apiRef={ed}
          placeholder={tl("Tulis query… Mod+Enter untuk menjalankan")}
          onChange={(t) => {
            try {
              localStorage.setItem(storeKey, t.slice(0, 200_000));
            } catch {
              /* opsional */
            }
          }}
        />
        {note && (
          <div className="db-ai-note">
            <div className="db-ai-note-head">
              <Sparkles size={12} /> {tl("Catatan AI")}
              <span className="spacer" />
              {/```/.test(note) && (
                <button className="btn btn-sm" onClick={() => replace(extractCode(note))}>
                  {tl("Sisipkan query")}
                </button>
              )}
              <IconButton label={tl("Tutup")} onClick={() => setNote(null)}>
                <X size={12} />
              </IconButton>
            </div>
            <pre>{note}</pre>
          </div>
        )}
        <div className="db-console-result">
          {e ? (
            <>
              <div className="db-results-bar">
                <ResultSummary e={e} />
                <span className="spacer" />
                <ResultActions e={e} />
              </div>
              {e.running ? (
                <div className="pad">
                  <Spinner />
                </div>
              ) : e.result?.columns.length ? (
                <ResultGrid columns={e.result.columns} rows={e.result.rows} />
              ) : e.error ? (
                <pre className="db-error-box">{e.error}</pre>
              ) : (
                <div className="pad hint">{e.result?.message ?? "OK"}</div>
              )}
            </>
          ) : (
            <div className="pad hint">{tl("Hasil query tampil di sini.")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErView({ r }: { r: DbTabRef }) {
  const conn = useConn(r.conn);
  const schemas = useDb((s) => s.schemas[r.conn]);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    void loadSchema(r.conn);
  }, [r.conn]);
  const layout = useMemo(() => erLayout((schemas ?? []) as DbSchema[]), [schemas]);
  if (!conn) return <Empty title={tl("Koneksi tidak ditemukan")} />;
  if (!schemas)
    return (
      <div className="pad">
        <Spinner />
      </div>
    );
  const nodeOf = new Map(layout.nodes.map((n) => [n.key, n]));
  const save = async () => {
    if (!svg.current) return;
    const path = await pickSavePath(`${conn.name}-er.svg`, [{ name: "SVG", extensions: ["svg"] }]);
    if (!path) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    const cs = getComputedStyle(document.documentElement);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", `background:${cs.getPropertyValue("--ed-bg") || "#fff"};font-family:system-ui,sans-serif`);
    let text = clone.outerHTML;
    // Variabel CSS diganti nilai nyata supaya berkas SVG tampil sama di luar aplikasi.
    text = text.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => cs.getPropertyValue(v).trim() || "#888");
    try {
      await api.writeText(path, text);
      toast(tl("Tersimpan: {name}", { name: path.split(/[\\/]/).pop() ?? path }), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  return (
    <div className="db-tab db-er">
      <div className="db-toolbar">
        <Network size={13} />
        <strong className="db-title">{conn.name}</strong>
        <span className="hint">
          {tl("{n} tabel · {m} relasi", { n: layout.nodes.length, m: layout.edges.length })}
          {layout.clipped > 0 && ` · ${tl("{n} disembunyikan", { n: layout.clipped })}`}
        </span>
        <span className="spacer" />
        <IconButton label={tl("Perkecil")} onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}>
          −
        </IconButton>
        <span className="hint">{Math.round(zoom * 100)}%</span>
        <IconButton label={tl("Perbesar")} onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>
          +
        </IconButton>
        <IconButton label={tl("Muat ulang skema")} onClick={() => void loadSchema(r.conn, true)}>
          <RefreshCw size={13} />
        </IconButton>
        <IconButton label={tl("Simpan SVG")} onClick={() => void save()}>
          <Download size={13} />
        </IconButton>
      </div>
      <div className="db-er-canvas" onWheel={(e) => (e.ctrlKey || e.metaKey) && (e.preventDefault(), setZoom((z) => Math.max(0.3, Math.min(2, z - e.deltaY / 500))))}>
        {!layout.nodes.length ? (
          <Empty title={tl("Belum ada tabel.")} />
        ) : (
          <svg ref={svg} width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={tl("Diagram ER {name}", { name: conn.name })}>
            {layout.edges.map((e, i) => {
              const a = nodeOf.get(e.from)!;
              const b = nodeOf.get(e.to)!;
              const y1 = a.y + ER.head + e.fromCol * ER.row + ER.row / 2 + 4;
              const y2 = b.y + ER.head + e.toCol * ER.row + ER.row / 2 + 4;
              const back = b.x >= a.x;
              const x1 = back ? a.x + ER.w : a.x;
              const x2 = back ? b.x : b.x + ER.w;
              const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (back ? 1 : -1);
              const on = hover === e.from || hover === e.to;
              return (
                <path key={i} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} className={`db-er-edge ${on ? "is-on" : ""}`}>
                  <title>{e.label}</title>
                </path>
              );
            })}
            {layout.nodes.map((n) => (
              <g key={n.key} transform={`translate(${n.x},${n.y})`} className={`db-er-node ${hover === n.key ? "is-on" : ""}`} onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}>
                <rect width={ER.w} height={n.h} rx={8} className="db-er-box" />
                <rect width={ER.w} height={ER.head} rx={8} className="db-er-head" />
                <rect y={ER.head - 8} width={ER.w} height={8} className="db-er-head" />
                <text x={10} y={18} className="db-er-title">
                  {n.table.name.length > 26 ? n.table.name.slice(0, 25) + "…" : n.table.name}
                  {n.table.kind === "view" ? " (view)" : ""}
                </text>
                {n.cols.map((c, i) => {
                  const fk = n.table.fks.some((f) => f.columns.includes(c.name));
                  return (
                    <g key={c.name} transform={`translate(0,${ER.head + 4 + i * ER.row})`}>
                      <text x={10} y={13} className={`db-er-col ${c.pk ? "is-pk" : ""}`}>
                        {c.pk ? "◆ " : fk ? "↗ " : "  "}
                        {c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name}
                      </text>
                      <text x={ER.w - 10} y={13} textAnchor="end" className="db-er-type">
                        {c.type.length > 14 ? c.type.slice(0, 13) + "…" : c.type}
                      </text>
                    </g>
                  );
                })}
                {n.more > 0 && (
                  <text x={10} y={ER.head + 4 + n.cols.length * ER.row + 13} className="db-er-type">
                    {tl("+{n} kolom", { n: n.more })}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

export default function DbTab({ tabId }: { tabId: string }) {
  const r = parseDbTab(tabId);
  if (!r) return <Empty title={tl("Tab database tidak valid")} />;
  if (!connById(r.conn) && useDb.getState().conns.length) return <Empty title={tl("Koneksi tidak ditemukan")} />;
  if (r.view === "table") return <TableView key={tabId} r={r} />;
  if (r.view === "er") return <ErView key={tabId} r={r} />;
  return <ConsoleView key={tabId} r={r} tabId={tabId} />;
}
