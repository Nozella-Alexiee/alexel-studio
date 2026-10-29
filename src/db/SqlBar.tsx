// Bilah di atas berkas query (.sql, .mongodb, .redis): pilih koneksi, Jalankan (Mod+Enter = statement di
// kursor atau seleksi), dan autocomplete nama tabel/kolom dari skema koneksi terpilih.

import { Database, Play, Square } from "lucide-react";
import { useEffect } from "react";
import { IconButton } from "../components/ui";
import * as docs from "../editor/documents";
import { getState, setLayout } from "../state/store";
import { tl } from "../i18n";
import { fileSchemaCompletion, kindHint, statementAt } from "./sqlText";
import { cancelQuery, connById, isSql, loadSchema, refreshConns, runQuery, setFileConn, useDb } from "./state";

/** Jalankan statement di kursor/seleksi berkas di grup ini. */
export function runFileQuery(path: string, group: number) {
  const id = useDb.getState().fileConn[path];
  const c = id ? connById(id) : undefined;
  if (!c) return false;
  const v = docs.viewOf(group);
  if (!v) return false;
  const sel = v.state.selection.main;
  const text = sel.empty ? statementAt(v.state.doc.toString(), sel.head, c.kind) : v.state.sliceDoc(sel.from, sel.to);
  if (text.trim()) void runQuery(c.id, text.trim());
  return true;
}

export function SqlBar({ path, group }: { path: string; group: number }) {
  const conns = useDb((s) => s.conns);
  const sel = useDb((s) => s.fileConn[path]);
  const schemas = useDb((s) => (sel ? s.schemas[sel] : undefined));
  const running = useDb((s) => s.results.some((r) => r.running && r.connId === sel));
  const hint = kindHint(path);
  const usable = conns.filter((c) => (hint ? c.kind === hint : isSql(c.kind)));
  const conn = sel ? conns.find((c) => c.id === sel) : undefined;

  useEffect(() => {
    if (!useDb.getState().conns.length) void refreshConns();
  }, []);
  // Pilih otomatis bila hanya ada satu koneksi yang cocok.
  useEffect(() => {
    if (!sel && usable.length === 1) setFileConn(path, usable[0].id);
  }, [sel, usable.length, path]);
  useEffect(() => {
    if (sel) void loadSchema(sel);
  }, [sel]);
  useEffect(() => {
    if (!conn || conn.kind === "redis") return docs.setAuxExtension(path, null);
    let alive = true;
    // Mongo memakai bahasa JS; SQL: dialek + skema untuk autocomplete.
    if (isSql(conn.kind)) void fileSchemaCompletion(conn.kind, schemas).then((ext) => alive && docs.setAuxExtension(path, ext));
    return () => {
      alive = false;
    };
  }, [conn?.id, conn?.kind, schemas, path]);
  useEffect(() => () => docs.setAuxExtension(path, null), [path]);

  // Mod+Enter di editor berkas ini (fase capture: sebelum keymap CodeMirror).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const v = docs.viewOf(group);
      if (!v?.hasFocus || docs.shownPath(group) !== path) return;
      if (runFileQuery(path, group)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [path, group]);

  return (
    <div className="db-sqlbar">
      <Database size={12} aria-hidden />
      <select
        className="input select"
        value={sel ?? ""}
        aria-label={tl("Koneksi untuk berkas ini")}
        onChange={(e) => {
          if (e.target.value === "__new") {
            useDb.setState({ editing: {} });
            setLayout({ sidebar: true, sideView: "db" });
            return;
          }
          setFileConn(path, e.target.value);
        }}
      >
        <option value="">{tl("Pilih koneksi…")}</option>
        {usable.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.env === "prod" ? ` (${tl("produksi")})` : ""}
          </option>
        ))}
        <option value="__new">{tl("+ Koneksi baru…")}</option>
      </select>
      {conn?.env === "prod" && <span className="db-env db-env-prod">{tl("produksi")}</span>}
      <button className="btn btn-sm" onClick={() => runFileQuery(path, group)} disabled={!conn} title={tl("Jalankan statement di kursor / seleksi (Mod+Enter)")}>
        <Play size={11} /> {tl("Jalankan")}
      </button>
      {running && conn && (
        <IconButton label={tl("Batalkan query")} onClick={() => void cancelQuery(conn.id)}>
          <Square size={11} />
        </IconButton>
      )}
      <span className="hint db-sqlbar-hint">{conn ? `Mod+Enter` : getState().root ? tl("Hubungkan berkas ini ke database untuk menjalankan query") : ""}</span>
    </div>
  );
}
