// Bilah di atas berkas .http/.rest: pilih environment, kirim request di kursor (Mod+Enter), dan
// tautan "Kirim request" di atas tiap request.

import { Globe, Send } from "lucide-react";
import { useEffect } from "react";
import * as docs from "../editor/documents";
import { dirname } from "../lib/paths";
import { toast } from "../state/store";
import { tl } from "../i18n";
import { httpLens, requestAt } from "./lens";
import { toCurl, type ParsedRequest } from "./parse";
import { loadEnvs, resolveRequest, send, setEnv, useHttp } from "./state";

const keyOf = (path: string, r: ParsedRequest) => `${path}#${r.index}`;

function sendParsed(path: string, r: ParsedRequest, vars: Record<string, string>) {
  void send(keyOf(path, r), { ...r, vars, baseDir: dirname(path) });
}

export function sendAtCursor(path: string, group: number): boolean {
  const v = docs.viewOf(group);
  if (!v) return false;
  const hit = requestAt(v.state.doc.toString(), v.state.selection.main.head);
  if (!hit) return false;
  sendParsed(path, hit.req, hit.vars);
  return true;
}

export function HttpBar({ path, group }: { path: string; group: number }) {
  const envs = useHttp((s) => s.envs);
  const env = useHttp((s) => s.env);
  useEffect(() => {
    void loadEnvs();
  }, [path]);
  useEffect(() => {
    docs.setAuxExtension(
      path,
      httpLens({
        send: (r, vars) => sendParsed(path, r, vars),
        curl: (r, vars) => void navigator.clipboard.writeText(toCurl(resolveRequest({ ...r, vars }))).then(() => toast(tl("Disalin sebagai cURL"), "success")),
      })
    );
    return () => docs.setAuxExtension(path, null);
  }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const v = docs.viewOf(group);
      if (!v?.hasFocus || docs.shownPath(group) !== path) return;
      if (sendAtCursor(path, group)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [path, group]);
  const names = Object.keys(envs).filter((n) => n !== "$shared");
  return (
    <div className="db-sqlbar">
      <Globe size={12} aria-hidden />
      <select className="input select" value={env ?? ""} onChange={(e) => setEnv(e.target.value || null)} aria-label={tl("Environment")} title={tl("Dari http-client.env.json / http-client.private.env.json")}>
        <option value="">{tl("Tanpa environment")}</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button className="btn btn-sm" onClick={() => !sendAtCursor(path, group) && toast(tl("Letakkan kursor di dalam sebuah request."))} title={tl("Kirim request di kursor (Mod+Enter)")}>
        <Send size={11} /> {tl("Kirim")}
      </button>
      <span className="hint db-sqlbar-hint">{tl("### memisahkan request · {{variabel}} · {{$secret NAMA}}")}</span>
    </div>
  );
}
