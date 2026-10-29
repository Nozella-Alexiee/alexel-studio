// Tab HTTP: builder request (method, URL, params, header, auth, body) dengan respons di bawahnya,
// atau tab "Respons" bersama untuk request yang dikirim dari berkas .http.

import { ClipboardPaste, Copy, Plus, Save, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { openFile } from "../app/actions";
import { IconButton, Segmented } from "../components/ui";
import { api, errMsg, pickSavePath } from "../lib/ipc";
import { join } from "../lib/paths";
import { getState, promptDialog, setState as appSet, toast } from "../state/store";
import { tl } from "../i18n";
import { fromCurl, toCurl, toHttpText, type SimpleRequest } from "./parse";
import { ResponseView } from "./ResponseView";
import { cancelSend, envValues, RESPONSE_TAB, send, useHttp } from "./state";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function KvEditor({ rows, onChange, keyLabel, placeholder }: { rows: [string, string][]; onChange: (r: [string, string][]) => void; keyLabel: string; placeholder?: string }) {
  const list = [...rows, ["", ""] as [string, string]];
  return (
    <div className="http-kv">
      {list.map(([k, v], i) => (
        <div key={i} className="http-kv-row">
          <input className="input mono" value={k} placeholder={keyLabel} aria-label={keyLabel} onChange={(e) => {
            const next = [...list];
            next[i] = [e.target.value, v];
            onChange(next.filter(([a, b], j) => j < list.length - 1 || a || b));
          }} />
          <input className="input mono" value={v} placeholder={placeholder ?? tl("nilai")} aria-label={tl("Nilai {name}", { name: k || keyLabel })} onChange={(e) => {
            const next = [...list];
            next[i] = [k, e.target.value];
            onChange(next.filter(([a, b], j) => j < list.length - 1 || a || b));
          }} />
          {i < rows.length ? (
            <IconButton label={tl("Hapus")} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2 size={12} />
            </IconButton>
          ) : (
            <span className="http-kv-pad" />
          )}
        </div>
      ))}
    </div>
  );
}

const splitUrl = (url: string): { base: string; params: [string, string][] } => {
  const q = url.indexOf("?");
  if (q < 0) return { base: url, params: [] };
  const params = url
    .slice(q + 1)
    .split("&")
    .filter(Boolean)
    .map((p) => {
      const e = p.indexOf("=");
      const dec = (s: string) => {
        try {
          return decodeURIComponent(s.replace(/\+/g, " "));
        } catch {
          return s;
        }
      };
      return (e < 0 ? [dec(p), ""] : [dec(p.slice(0, e)), dec(p.slice(e + 1))]) as [string, string];
    });
  return { base: url.slice(0, q), params };
};
// {{var}} dibiarkan apa adanya supaya tetap bisa disubstitusi.
const enc = (s: string) => s.split(/(\{\{[^}]*\}\})/).map((x) => (x.startsWith("{{") ? x : encodeURIComponent(x))).join("");
const joinUrl = (base: string, params: [string, string][]) => (params.length ? `${base}?${params.map(([k, v]) => `${enc(k)}${v !== "" ? `=${enc(v)}` : ""}`).join("&")}` : base);

function Builder({ id }: { id: string }) {
  const draft = useHttp((s) => s.drafts[id]);
  const ex = useHttp((s) => s.exchanges[id]);
  const env = useHttp((s) => s.env);
  const [section, setSection] = useState<"params" | "headers" | "auth" | "body">("params");
  const r: SimpleRequest = draft ?? { method: "GET", url: "", headers: [], body: null };
  const update = (p: Partial<SimpleRequest>) => {
    const next = { ...r, ...p };
    useHttp.setState((s) => ({ drafts: { ...s.drafts, [id]: next } }));
    const tab = getState().tabs[id];
    const name = next.url ? `${next.method} ${next.url.replace(/^https?:\/\//, "").slice(0, 30)}` : tl("Request baru");
    if (tab && tab.name !== name) appSet((s) => ({ tabs: { ...s.tabs, [id]: { ...tab, name } } }));
  };
  const { base, params } = useMemo(() => splitUrl(r.url), [r.url]);
  const auth = r.headers.find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? "";
  const authKind = /^bearer /i.test(auth) ? "bearer" : /^basic /i.test(auth) ? "basic" : auth ? "custom" : "none";
  const ct = r.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  const bodyKind = r.body === null ? "none" : /json/i.test(ct) ? "json" : /x-www-form-urlencoded/i.test(ct) ? "form" : "raw";
  const setHeader = (name: string, value: string | null) => {
    const rest = r.headers.filter(([k]) => k.toLowerCase() !== name.toLowerCase());
    update({ headers: value === null ? rest : [...rest, [name, value]] });
  };
  const go = () => {
    if (!r.url.trim()) return toast(tl("Isi URL dulu."));
    void send(id, { ...r, url: /^(https?:\/\/|\{\{)/i.test(r.url.trim()) ? r.url.trim() : `http://${r.url.trim()}` });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && document.querySelector(`[data-http-tab="${CSS.escape(id)}"]`)?.contains(document.activeElement)) {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const saveHttp = async () => {
    const root = getState().root;
    const name = await promptDialog(tl("Nama request"), { message: tl("Dipakai untuk merujuk respons: {{nama.response.body.$.field}}"), defaultValue: "", placeholder: "login" });
    if (name === null) return;
    const def = root ? join(root, ".alexel", "http", "requests.http") : "requests.http";
    const path = await pickSavePath(def, [{ name: "HTTP", extensions: ["http", "rest"] }]);
    if (!path) return;
    try {
      const old = await api.readText(path).then((f) => f.content).catch(() => "");
      const sep = old.trim() ? `${old.replace(/\s*$/, "")}\n\n###\n` : "";
      await api.writeText(path, sep + toHttpText(r, name.trim() || undefined));
      void openFile(path);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const importCurl = async () => {
    const text = await promptDialog(tl("Impor cURL"), { message: tl("Tempel perintah curl (mis. dari DevTools → Copy as cURL)."), placeholder: "curl https://…" });
    if (!text) return;
    try {
      update(fromCurl(text));
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const vars = Object.keys(envValues());

  return (
    <div className="http-builder" data-http-tab={id}>
      <div className="http-line">
        <select className="input select http-method" value={r.method} onChange={(e) => update({ method: e.target.value })} aria-label="Method">
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input className="input mono http-url" value={r.url} placeholder="https://api.example.com/users  ·  {{host}}/users" onChange={(e) => update({ url: e.target.value })} onKeyDown={(e) => e.key === "Enter" && go()} aria-label="URL" autoFocus={!r.url} spellCheck={false} />
        {ex?.running ? (
          <button className="btn" onClick={() => void cancelSend(id)}>
            <Square size={12} /> {tl("Batal")}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={go} title={tl("Kirim (Mod+Enter)")}>
            <Send size={12} /> {tl("Kirim")}
          </button>
        )}
      </div>
      <div className="http-tools">
        <Segmented label={tl("Bagian request")} value={section} onChange={setSection} options={[
          { id: "params", label: tl("Params") + (params.length ? ` ${params.length}` : "") },
          { id: "headers", label: tl("Header") + (r.headers.length ? ` ${r.headers.length}` : "") },
          { id: "auth", label: "Auth" },
          { id: "body", label: "Body" },
        ]} />
        <span className="spacer" />
        {env && <span className="hint" title={vars.join(", ")}>{tl("env: {name}", { name: env })}</span>}
        <IconButton label={tl("Impor cURL")} onClick={() => void importCurl()}>
          <ClipboardPaste size={13} />
        </IconButton>
        <IconButton label={tl("Salin sebagai cURL")} onClick={() => void navigator.clipboard.writeText(toCurl(r)).then(() => toast(tl("Disalin"), "success"))}>
          <Copy size={13} />
        </IconButton>
        <IconButton label={tl("Simpan ke berkas .http")} onClick={() => void saveHttp()}>
          <Save size={13} />
        </IconButton>
      </div>
      <div className="http-section">
        {section === "params" && <KvEditor rows={params} keyLabel={tl("parameter")} onChange={(p) => update({ url: joinUrl(base, p) })} />}
        {section === "headers" && <KvEditor rows={r.headers} keyLabel={tl("Header")} onChange={(h) => update({ headers: h })} />}
        {section === "auth" && (
          <div className="http-auth">
            <Segmented label="Auth" value={authKind === "custom" ? "none" : authKind} onChange={(k) => setHeader("Authorization", k === "none" ? null : k === "bearer" ? "Bearer {{$secret TOKEN}}" : `Basic ${btoa("user:password")}`)} options={[
              { id: "none", label: tl("Tanpa") },
              { id: "bearer", label: "Bearer" },
              { id: "basic", label: "Basic" },
            ]} />
            {authKind === "bearer" && (
              <label className="db-field">
                <span>Token</span>
                <input className="input mono" value={auth.replace(/^bearer /i, "")} onChange={(e) => setHeader("Authorization", `Bearer ${e.target.value}`)} />
                <small className="hint">{tl("Simpan token sebagai rahasia di panel API lalu pakai {{$secret NAMA}} supaya tidak tertulis di berkas.")}</small>
              </label>
            )}
            {authKind === "basic" && (
              <BasicAuth value={auth} onChange={(v) => setHeader("Authorization", v)} />
            )}
          </div>
        )}
        {section === "body" && (
          <div className="http-body">
            <Segmented label="Body" value={bodyKind} onChange={(k) => {
              if (k === "none") return update({ body: null, headers: r.headers.filter(([h]) => h.toLowerCase() !== "content-type") });
              const type = k === "json" ? "application/json" : k === "form" ? "application/x-www-form-urlencoded" : "text/plain";
              update({ body: r.body ?? (k === "json" ? "{\n  \n}" : ""), headers: [...r.headers.filter(([h]) => h.toLowerCase() !== "content-type"), ["Content-Type", type]] });
            }} options={[
              { id: "none", label: tl("Tanpa") },
              { id: "json", label: "JSON" },
              { id: "form", label: "Form" },
              { id: "raw", label: tl("Mentah") },
            ]} />
            {bodyKind !== "none" && <textarea className="input mono http-body-text" value={r.body ?? ""} onChange={(e) => update({ body: e.target.value })} spellCheck={false} aria-label="Body" />}
            {bodyKind === "json" && r.body && (() => {
              try {
                JSON.parse(r.body.replace(/\{\{[^}]*\}\}/g, "0"));
                return null;
              } catch (e) {
                return <small className="tone-danger-fg">{(e as Error).message}</small>;
              }
            })()}
          </div>
        )}
      </div>
      <div className="http-builder-resp">
        <ResponseView ex={ex} />
      </div>
    </div>
  );
}

function BasicAuth({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let user = "";
  let pass = "";
  try {
    [user, pass] = atob(value.replace(/^basic /i, "")).split(/:(.*)/s);
  } catch {
    /* bukan base64 */
  }
  const set = (u: string, p: string) => onChange(`Basic ${btoa(`${u}:${p}`)}`);
  return (
    <div className="db-grid2">
      <label className="db-field">
        <span>{tl("Pengguna")}</span>
        <input className="input" value={user} onChange={(e) => set(e.target.value, pass ?? "")} />
      </label>
      <label className="db-field">
        <span>Password</span>
        <input className="input" type="password" value={pass ?? ""} onChange={(e) => set(user, e.target.value)} />
      </label>
    </div>
  );
}

function SharedResponse() {
  const cur = useHttp((s) => s.current);
  const ex = useHttp((s) => (cur ? s.exchanges[cur] : undefined));
  return (
    <div className="http-builder">
      {ex && (
        <div className="http-line http-line-ro">
          <span className="http-method-tag">{ex.req.method}</span>
          <span className="mono http-url-ro" title={ex.req.url}>{ex.req.url}</span>
          <IconButton label={tl("Buka di builder")} onClick={() => import("./state").then((m) => m.openBuilder(ex.req))}>
            <Plus size={13} />
          </IconButton>
        </div>
      )}
      <ResponseView ex={ex} />
    </div>
  );
}

export default function HttpTab({ tabId }: { tabId: string }) {
  if (tabId === RESPONSE_TAB) return <SharedResponse />;
  return <Builder id={tabId} />;
}
