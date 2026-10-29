// Sidebar API: request baru / impor cURL, berkas .http di project, environment, rahasia, riwayat.

import { ClipboardPaste, FileCode2, KeyRound, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { openFile } from "../app/actions";
import { Empty, IconButton } from "../components/ui";
import { api, errMsg } from "../lib/ipc";
import { relative } from "../lib/paths";
import { promptDialog, toast, useStore } from "../state/store";
import { tl } from "../i18n";
import { fromCurl } from "./parse";
import { clearHistory, loadEnvs, openBuilder, saveSecret, setEnv, useHttp } from "./state";

export async function importCurlToBuilder() {
  const text = await promptDialog(tl("Impor cURL"), { message: tl("Tempel perintah curl (mis. dari DevTools → Copy as cURL)."), placeholder: "curl https://…" });
  if (!text) return;
  try {
    openBuilder(fromCurl(text));
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

function Secrets() {
  const secrets = useHttp((s) => s.secrets);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const add = async () => {
    if (!name.trim() || !value) return;
    await saveSecret(name.trim(), value);
    setName("");
    setValue("");
  };
  return (
    <section>
      <div className="git-section-head">
        <span>{tl("Rahasia")}</span>
      </div>
      <p className="hint pad-x http-help">{tl("Disimpan terenkripsi di perangkat ini. Pakai {{$secret NAMA}} di URL, header, atau body.")}</p>
      {secrets.map((s) => (
        <div key={s} className="tree-row http-secret">
          <KeyRound size={12} className="db-pk-ico" />
          <span className="mono">{s}</span>
          <span className="spacer" />
          <IconButton label={tl("Salin placeholder")} onClick={() => void navigator.clipboard.writeText(`{{$secret ${s}}}`).then(() => toast(tl("Disalin"), "success"))}>
            <ClipboardPaste size={12} />
          </IconButton>
          <IconButton label={tl("Hapus rahasia {name}", { name: s })} onClick={() => void saveSecret(s, null)}>
            <Trash2 size={12} />
          </IconButton>
        </div>
      ))}
      <div className="http-secret-add">
        <input className="input mono" placeholder={tl("NAMA")} value={name} onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, "_"))} aria-label={tl("Nama rahasia")} />
        <input className="input" type="password" placeholder={tl("nilai")} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} aria-label={tl("Nilai rahasia")} autoComplete="new-password" />
        <IconButton label={tl("Simpan rahasia")} onClick={() => void add()} disabled={!name.trim() || !value}>
          <Plus size={13} />
        </IconButton>
      </div>
    </section>
  );
}

export default function ApiPanel() {
  const root = useStore((s) => s.root);
  const envs = useHttp((s) => s.envs);
  const env = useHttp((s) => s.env);
  const history = useHttp((s) => s.history);
  const [files, setFiles] = useState<string[]>([]);
  const refresh = () => {
    void loadEnvs();
    if (root) void api.listFiles(root).then((l) => setFiles(l.filter((p) => /\.(http|rest)$/i.test(p)).slice(0, 200))).catch(() => setFiles([]));
  };
  useEffect(refresh, [root]);
  const names = Object.keys(envs).filter((n) => n !== "$shared");
  return (
    <div className="db-panel">
      <div className="side-head">
        <span className="side-title">API</span>
        <div className="side-actions">
          <IconButton label={tl("Buat request dari kode (AI)")} onClick={() => void import("./ai").then((m) => m.requestsFromCode())}>
            <Sparkles size={13} />
          </IconButton>
          <IconButton label={tl("Impor cURL")} onClick={() => void importCurlToBuilder()}>
            <ClipboardPaste size={13} />
          </IconButton>
          <IconButton label={tl("Muat ulang")} onClick={refresh}>
            <RefreshCw size={13} />
          </IconButton>
          <IconButton label={tl("Request baru")} onClick={() => openBuilder()}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div className="side-scroll">
        <section>
          <div className="git-section-head">
            <span>{tl("Environment")}</span>
          </div>
          <div className="pad-x http-env">
            <select className="input select" value={env ?? ""} onChange={(e) => setEnv(e.target.value || null)} aria-label={tl("Environment")}>
              <option value="">{tl("Tanpa environment")}</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n} ({Object.keys(envs[n]).length})
                </option>
              ))}
            </select>
            {!names.length && <p className="hint http-help">{tl("Buat http-client.env.json di root project, mis. {\"dev\": {\"host\": \"http://localhost:3000\"}}.")}</p>}
          </div>
        </section>
        <section>
          <div className="git-section-head">
            <span>{tl("Berkas .http")}</span>
          </div>
          {files.length ? (
            files.map((f) => (
              <button key={f} className="tree-row http-file" onClick={() => void openFile(f)} title={f}>
                <FileCode2 size={13} />
                <span>{root ? relative(root, f) : f}</span>
              </button>
            ))
          ) : (
            <Empty title={tl("Belum ada berkas .http")}>
              <button className="btn btn-sm" onClick={() => openBuilder()}>
                <Plus size={12} /> {tl("Request baru")}
              </button>
            </Empty>
          )}
        </section>
        <Secrets />
        <section>
          <div className="git-section-head">
            <span>{tl("Riwayat")}</span>
            <span className="spacer" />
            {history.length > 0 && (
              <IconButton label={tl("Hapus riwayat")} onClick={clearHistory}>
                <Trash2 size={12} />
              </IconButton>
            )}
          </div>
          {history.slice(0, 40).map((h) => (
            <button key={h.at} className="tree-row http-hist" onClick={() => openBuilder(h.req)} title={h.req.url}>
              <span className={`http-method-tag m-${h.req.method}`}>{h.req.method}</span>
              <span className="http-hist-url">{h.req.url.replace(/^https?:\/\//, "")}</span>
              {h.status && <span className={`http-hist-status ${h.status >= 400 ? "tone-danger-fg" : "hint"}`}>{h.status}</span>}
            </button>
          ))}
          {!history.length && <div className="pad-x hint">{tl("Belum ada request.")}</div>}
        </section>
      </div>
    </div>
  );
}
