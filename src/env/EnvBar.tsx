// Bilah di atas berkas .env: jumlah kunci, peringatan .gitignore & kunci hilang, buka tabel.

import { AlertTriangle, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import * as docs from "../editor/documents";
import { toast, useStore } from "../state/store";
import { errMsg } from "../lib/ipc";
import { tl } from "../i18n";
import { addToGitignore, envStatus, openEnvTab, writeExample, type EnvStatus } from "./EnvTab";
import { envKeys, parseEnvLines } from "./parse";

export function EnvBar({ path }: { path: string }) {
  const dirty = useStore((s) => s.tabs[path]?.dirty);
  const [keys, setKeys] = useState<string[]>([]);
  const [st, setSt] = useState<EnvStatus | null>(null);
  useEffect(() => {
    const k = envKeys(parseEnvLines(docs.currentText(path) ?? ""));
    setKeys(k);
    void envStatus(path, k)
      .then(setSt)
      .catch((e) => console.warn("Status .env", path, e));
  }, [path, dirty]);
  return (
    <div className="db-sqlbar">
      <span className="hint">{tl("{n} kunci", { n: keys.length })}</span>
      {st?.ignored === false && (
        <button className="btn btn-sm env-bar-warn" onClick={() =>
            void addToGitignore(path)
              .then(() => envStatus(path, keys).then(setSt))
              .catch((e) => toast(tl("Gagal menambahkan ke .gitignore: {error}", { error: errMsg(e) }), "error"))
          } title={tl("Tambahkan ke .gitignore")}>
          <AlertTriangle size={11} /> {tl("Tidak di .gitignore")}
        </button>
      )}
      {st && st.missing.length > 0 && <span className="tone-warning-fg" title={st.missing.join(", ")}>{tl("{n} kunci dari .env.example belum diisi", { n: st.missing.length })}</span>}
      <span className="spacer" />
      {!st?.example && (
        <button className="btn btn-sm" onClick={() =>
            void writeExample(path, parseEnvLines(docs.currentText(path) ?? "")).catch((e) => toast(tl("Gagal membuat .env.example: {error}", { error: errMsg(e) }), "error"))
          }>
          {tl("Buat .env.example")}
        </button>
      )}
      <button className="btn btn-sm" onClick={() => openEnvTab(path)}>
        <Table2 size={11} /> {tl("Edit sebagai tabel")}
      </button>
    </div>
  );
}
