// Panel bawah "Hasil": hasil query terakhir (dari berkas .sql, konsol, atau AI), salin/ekspor.

import { Clipboard, Database, Download, Square } from "lucide-react";
import { Empty, IconButton, Spinner } from "../components/ui";
import { api, errMsg, pickSavePath } from "../lib/ipc";
import { toast } from "../state/store";
import { tl } from "../i18n";
import { asCsv, asJson, asMarkdown, ResultGrid } from "./ResultGrid";
import { cancelQuery, useDb, type ResultEntry } from "./state";

export function ResultSummary({ e }: { e: ResultEntry }) {
  const r = e.result;
  if (e.running) return <span className="hint">{tl("Menjalankan…")}</span>;
  if (e.error) return <span className="tone-danger-fg db-err">{e.error}</span>;
  if (!r) return null;
  const parts = [r.columns.length ? tl("{n} baris hasil", { n: r.rows.length.toLocaleString() }) + (r.truncated ? ` (${tl("dipotong")})` : "") : null, r.affected !== undefined && r.affected !== null ? tl("{n} terpengaruh", { n: r.affected }) : null, r.message && !r.columns.length ? r.message : null, `${r.ms} ms`];
  return <span className="hint">{parts.filter(Boolean).join(" · ")}</span>;
}

export async function exportResult(e: ResultEntry, format: "csv" | "json") {
  const path = await pickSavePath(`hasil.${format}`, [{ name: format.toUpperCase(), extensions: [format] }]);
  if (!path) return;
  try {
    // Ekspor menjalankan ulang query tanpa batas tampilan (maks 1 juta baris) di main process.
    const { rows } = await api.dbExport(e.connId, e.text, format, path);
    toast(tl("{n} baris diekspor", { n: rows.toLocaleString() }), "success");
  } catch (err) {
    toast(errMsg(err), "error");
  }
}

export function ResultActions({ e }: { e: ResultEntry }) {
  const r = e.result;
  if (e.running)
    return (
      <IconButton label={tl("Batalkan query")} onClick={() => void cancelQuery(e.connId)}>
        <Square size={12} />
      </IconButton>
    );
  if (!r?.columns.length) return null;
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast(tl("Disalin"), "success"));
  return (
    <>
      <select className="input select db-copy" aria-label={tl("Salin hasil")} value="" onChange={(ev) => {
        const v = ev.target.value;
        if (v === "csv") copy(asCsv(r.columns, r.rows));
        if (v === "json") copy(asJson(r.columns, r.rows));
        if (v === "md") copy(asMarkdown(r.columns, r.rows));
        ev.target.value = "";
      }}>
        <option value="">{tl("Salin…")}</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
        <option value="md">Markdown</option>
      </select>
      <IconButton label={tl("Ekspor CSV")} onClick={() => void exportResult(e, "csv")}>
        <Download size={12} />
      </IconButton>
      <IconButton label={tl("Ekspor JSON")} onClick={() => void exportResult(e, "json")}>
        <Clipboard size={12} />
      </IconButton>
    </>
  );
}

export default function ResultsPanel() {
  const results = useDb((s) => s.results);
  const active = useDb((s) => s.activeResult);
  const e = results.find((r) => r.key === active) ?? results[0];
  if (!e)
    return (
      <Empty icon={<Database size={22} />} title={tl("Belum ada hasil query")}>
        {tl("Jalankan query dari berkas .sql (Mod+Enter) atau dari panel Database.")}
      </Empty>
    );
  return (
    <div className="db-results">
      <div className="db-results-bar">
        <select className="input select" value={e.key} onChange={(ev) => useDb.setState({ activeResult: Number(ev.target.value) })} aria-label={tl("Riwayat hasil")}>
          {results.map((r) => (
            <option key={r.key} value={r.key}>
              {new Date(r.at).toLocaleTimeString()} · {r.connName} · {r.text.replace(/\s+/g, " ").slice(0, 60)}
            </option>
          ))}
        </select>
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
    </div>
  );
}
