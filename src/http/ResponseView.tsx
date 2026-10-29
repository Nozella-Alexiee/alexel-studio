// Tampilan respons HTTP: status, waktu, ukuran, header, body (JSON rapi / pohon / mentah, pratinjau
// HTML di iframe sandbox tanpa skrip, gambar), salin & simpan.

import { ChevronDown, ChevronRight, Copy, Download, Square, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import { IconButton, Segmented, Spinner } from "../components/ui";
import { api, errMsg, pickSavePath } from "../lib/ipc";
import { toast } from "../state/store";
import { tl } from "../i18n";
import type { Exchange } from "./state";
import { cancelSend } from "./state";
import { toCurl } from "./parse";

export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const statusTone = (s: number) => (s >= 500 ? "is-5xx" : s >= 400 ? "is-4xx" : s >= 300 ? "is-3xx" : "is-2xx");

function JsonNode({ k, v, depth }: { k: string | null; v: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isObj = v !== null && typeof v === "object";
  const entries = isObj ? (Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as object)) : [];
  return (
    <div className="http-json-node" style={{ paddingLeft: depth ? 14 : 0 }}>
      <div className="http-json-row">
        {isObj ? (
          <button className="tree-chev" onClick={() => setOpen((o) => !o)} aria-label={open ? tl("Ciutkan") : tl("Bentangkan")}>
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="http-json-pad" />
        )}
        {k !== null && <span className="http-json-key">{k}:</span>}
        {isObj ? (
          <span className="hint">
            {Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`}
          </span>
        ) : (
          <span className={`http-json-val is-${v === null ? "null" : typeof v}`}>{typeof v === "string" ? JSON.stringify(v) : String(v)}</span>
        )}
      </div>
      {isObj && open && entries.slice(0, 500).map(([ck, cv]) => <JsonNode key={ck} k={ck} v={cv} depth={depth + 1} />)}
      {isObj && open && entries.length > 500 && <div className="hint" style={{ paddingLeft: 28 }}>{tl("+{n} lagi", { n: entries.length - 500 })}</div>}
    </div>
  );
}

export function ResponseView({ ex }: { ex: Exchange | undefined }) {
  const [view, setView] = useState<"pretty" | "tree" | "raw" | "headers" | "preview">("pretty");
  const res = ex?.res;
  const json = useMemo(() => {
    if (!res?.text || !/json/i.test(res.contentType) && !/^\s*[[{]/.test(res.text)) return undefined;
    try {
      return JSON.parse(res.text) as unknown;
    } catch {
      return undefined;
    }
  }, [res]);
  if (!ex) return <div className="pad hint">{tl("Kirim request untuk melihat respons.")}</div>;
  if (ex.running)
    return (
      <div className="http-resp">
        <div className="http-resp-bar">
          <Spinner size={12} /> <span className="hint">{tl("Mengirim {method} {url}…", { method: ex.req.method, url: ex.req.url })}</span>
          <span className="spacer" />
          <IconButton label={tl("Batalkan")} onClick={() => void cancelSend(ex.key)}>
            <Square size={12} />
          </IconButton>
        </div>
      </div>
    );
  if (ex.error || !res)
    return (
      <div className="http-resp">
        <pre className="db-error-box">{tl(ex.error ?? "")}</pre>
      </div>
    );
  const isHtml = /html/i.test(res.contentType);
  const isImage = /^image\//i.test(res.contentType) && res.base64;
  const pretty = json !== undefined ? JSON.stringify(json, null, 2) : res.text ?? "";
  const views: { id: typeof view; label: string }[] = [
    { id: "pretty", label: json !== undefined ? "JSON" : tl("Body") },
    ...(json !== undefined ? [{ id: "tree" as const, label: tl("Pohon") }] : []),
    { id: "raw", label: tl("Mentah") },
    ...(isHtml || isImage ? [{ id: "preview" as const, label: tl("Pratinjau") }] : []),
    { id: "headers", label: tl("Header ({n})", { n: res.headers.length }) },
  ];
  const cur = views.some((v) => v.id === view) ? view : "pretty";
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast(tl("Disalin"), "success"));
  const save = async () => {
    const ext = json !== undefined ? "json" : isHtml ? "html" : isImage ? res.contentType.split("/")[1]?.split(/[;+]/)[0] ?? "bin" : "txt";
    const path = await pickSavePath(`response.${ext}`);
    if (!path) return;
    try {
      if (res.base64) await api.writeBase64(path, res.base64);
      else await api.writeText(path, res.text ?? "");
      toast(tl("Tersimpan: {name}", { name: path.split(/[\\/]/).pop() ?? path }), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  return (
    <div className="http-resp">
      <div className="http-resp-bar">
        <span className={`http-status ${statusTone(res.status)}`}>
          {res.status} {res.statusText}
        </span>
        <span className="hint">{res.ms} ms</span>
        <span className="hint">{fmtSize(res.size)}{res.truncated ? ` · ${tl("dipotong di 20 MB")}` : ""}</span>
        {res.redirected && <span className="hint" title={res.url}>{tl("dialihkan")}</span>}
        <span className="spacer" />
        <Segmented label={tl("Tampilan respons")} value={cur} onChange={setView} options={views} />
        <IconButton label={tl("Salin body")} onClick={() => copy(pretty)}>
          <Copy size={12} />
        </IconButton>
        <IconButton label={tl("Simpan body")} onClick={() => void save()}>
          <Download size={12} />
        </IconButton>
        <IconButton label={tl("Salin sebagai cURL")} onClick={() => copy(toCurl(ex.req))}>
          <Terminal size={12} />
        </IconButton>
      </div>
      <div className="http-resp-body">
        {cur === "headers" ? (
          <table className="http-headers">
            <tbody>
              {res.headers.map(([k, v], i) => (
                <tr key={i}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : cur === "tree" ? (
          <div className="http-json">
            <JsonNode k={null} v={json} depth={0} />
          </div>
        ) : cur === "preview" ? (
          isImage ? (
            <div className="http-img">
              <img src={`data:${res.contentType.split(";")[0]};base64,${res.base64}`} alt={tl("Gambar respons")} />
            </div>
          ) : (
            <iframe className="http-html" sandbox="" srcDoc={res.text ?? ""} title={tl("Pratinjau HTML")} />
          )
        ) : res.text !== null ? (
          <pre className="http-pre">{(cur === "raw" ? res.text : pretty).slice(0, 2_000_000)}</pre>
        ) : (
          <div className="pad hint">{tl("Body biner ({type}, {size}). Gunakan Simpan body.", { type: res.contentType || "?", size: fmtSize(res.size) })}</div>
        )}
      </div>
    </div>
  );
}
