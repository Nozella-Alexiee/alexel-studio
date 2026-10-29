// Dialog tambah/ubah koneksi database: URL atau form, password (disimpan terenkripsi di main),
// read-only, tanda lingkungan, dan uji koneksi.

import { CheckCircle2, FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DbConnection, DbKind } from "../../electron/db/types";
import { IconButton, Segmented, Spinner } from "../components/ui";
import { api, errMsg, pickFile } from "../lib/ipc";
import { toast } from "../state/store";
import { tl } from "../i18n";
import { KIND_LABEL, loadSchema, refreshConns, refreshDetected, useDb } from "./state";

const PORTS: Record<DbKind, number> = { postgres: 5432, mysql: 3306, sqlite: 0, mongodb: 27017, redis: 6379 };

export function ConnectionDialog() {
  const editing = useDb((s) => s.editing);
  const [c, setC] = useState<Partial<DbConnection> & { password?: string }>({});
  const [mode, setMode] = useState<"url" | "form">("form");
  const [test, setTest] = useState<{ busy?: boolean; ok?: string; err?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setC({ kind: "postgres", ...editing });
    setMode(editing.url ? "url" : "form");
    setTest({});
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  if (!editing) return null;
  const close = () => useDb.setState({ editing: null });
  const kind = (c.kind ?? "postgres") as DbKind;
  const up = (p: Partial<typeof c>) => {
    setC((x) => ({ ...x, ...p }));
    setTest({});
  };
  const payload = () => {
    const out = { ...c };
    if (kind === "sqlite") {
      delete out.url;
    } else if (mode === "url") {
      delete out.host;
      delete out.port;
      delete out.user;
    } else delete out.url;
    if (out.password === undefined || (out.password === "" && c.hasPassword)) delete out.password;
    return out;
  };
  const runTest = async () => {
    setTest({ busy: true });
    try {
      setTest({ ok: await api.dbTest(payload()) });
    } catch (e) {
      setTest({ err: errMsg(e) });
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.dbSave(payload());
      await refreshConns();
      void refreshDetected();
      close();
      void loadSchema(saved.id, true);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };
  const valid = kind === "sqlite" ? !!c.file : mode === "url" ? !!c.url?.trim() : true;

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog db-dialog" role="dialog" aria-modal="true" aria-labelledby="db-dlg-title">
        <div className="db-dialog-head">
          <h2 id="db-dlg-title" className="dialog-title">
            {c.id ? tl("Ubah koneksi") : tl("Koneksi database baru")}
          </h2>
          <IconButton label={tl("Tutup")} onClick={close}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="db-kinds" role="radiogroup" aria-label={tl("Jenis database")}>
          {(Object.keys(KIND_LABEL) as DbKind[]).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={`db-kind ${kind === k ? "is-on" : ""}`} onClick={() => up({ kind: k, port: undefined })} disabled={!!c.id && c.kind !== k}>
              <span className={`db-kind-dot db-k-${k}`} />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="db-field">
          <span>{tl("Nama")}</span>
          <input className="input" value={c.name ?? ""} placeholder={tl("otomatis dari host/berkas")} onChange={(e) => up({ name: e.target.value })} />
        </label>
        {kind === "sqlite" ? (
          <label className="db-field">
            <span>{tl("Berkas")}</span>
            <div className="db-row-inline">
              <input className="input" value={c.file ?? ""} placeholder="/path/ke/database.db" onChange={(e) => up({ file: e.target.value })} />
              <IconButton
                label={tl("Pilih berkas")}
                onClick={async () => {
                  const f = await pickFile([{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3", "db3"] }, { name: "*", extensions: ["*"] }]);
                  if (f) up({ file: f });
                }}
              >
                <FolderOpen size={14} />
              </IconButton>
            </div>
          </label>
        ) : (
          <>
            <Segmented label={tl("Cara isi")} value={mode} onChange={setMode} options={[{ id: "form", label: tl("Form") }, { id: "url", label: "URL" }]} />
            {mode === "url" ? (
              <label className="db-field">
                <span>URL</span>
                <input className="input mono" value={c.url ?? ""} placeholder={kind === "postgres" ? "postgresql://user:pass@localhost:5432/db" : kind === "mysql" ? "mysql://user:pass@localhost:3306/db" : kind === "mongodb" ? "mongodb://localhost:27017/db" : "redis://localhost:6379/0"} onChange={(e) => up({ url: e.target.value })} spellCheck={false} />
                <small className="hint">{tl("Password di URL dipisahkan dan disimpan terenkripsi.")}</small>
              </label>
            ) : (
              <div className="db-grid2">
                <label className="db-field">
                  <span>Host</span>
                  <input className="input" value={c.host ?? ""} placeholder="localhost" onChange={(e) => up({ host: e.target.value })} />
                </label>
                <label className="db-field">
                  <span>Port</span>
                  <input className="input" inputMode="numeric" value={c.port ?? ""} placeholder={String(PORTS[kind])} onChange={(e) => up({ port: Number(e.target.value) || undefined })} />
                </label>
                <label className="db-field">
                  <span>{tl("Pengguna")}</span>
                  <input className="input" value={c.user ?? ""} onChange={(e) => up({ user: e.target.value })} autoComplete="off" />
                </label>
                <label className="db-field">
                  <span>{kind === "redis" ? tl("Nomor DB") : "Database"}</span>
                  <input className="input" value={c.database ?? ""} placeholder={kind === "redis" ? "0" : ""} onChange={(e) => up({ database: e.target.value })} />
                </label>
              </div>
            )}
            <label className="db-field">
              <span>Password</span>
              <input className="input" type="password" value={c.password ?? ""} placeholder={c.hasPassword ? tl("(tersimpan — kosongkan untuk tetap)") : ""} onChange={(e) => up({ password: e.target.value })} autoComplete="new-password" />
            </label>
            {(kind === "postgres" || kind === "mysql") && (
              <label className="db-check">
                <input type="checkbox" checked={!!c.ssl} onChange={(e) => up({ ssl: e.target.checked })} /> SSL/TLS
              </label>
            )}
          </>
        )}
        <label className="db-check">
          <input type="checkbox" checked={!!c.readOnly} onChange={(e) => up({ readOnly: e.target.checked })} /> {tl("Read-only (blokir query yang mengubah data)")}
        </label>
        <div className="db-field">
          <span>{tl("Lingkungan")}</span>
          <Segmented label={tl("Lingkungan")} value={c.env ?? "dev"} onChange={(env) => up({ env })} options={[{ id: "dev", label: "dev" }, { id: "staging", label: "staging" }, { id: "prod", label: tl("produksi") }]} />
        </div>
        {test.ok && (
          <p className="db-test-ok">
            <CheckCircle2 size={13} /> {test.ok.split("\n")[0].slice(0, 120)}
          </p>
        )}
        {test.err && <pre className="db-error-box">{test.err}</pre>}
        <div className="dialog-actions">
          <button className="btn" onClick={() => void runTest()} disabled={!valid || test.busy}>
            {test.busy ? <Spinner size={12} /> : null} {tl("Uji koneksi")}
          </button>
          <span className="spacer" />
          <button className="btn" onClick={close}>
            {tl("Batal")}
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={!valid || saving}>
            {tl("Simpan")}
          </button>
        </div>
      </div>
    </div>
  );
}
