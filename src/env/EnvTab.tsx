// .env manager: editor tabel untuk berkas .env* (nilai rahasia disamarkan), kunci yang hilang
// dibanding .env.example, peringatan bila .env tidak di-.gitignore, dan "Buat .env.example".

import { AlertTriangle, Eye, EyeOff, FileCode2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { openFile, showTab } from "../app/actions";
import { Empty, IconButton, Spinner } from "../components/ui";
import * as docs from "../editor/documents";
import { api, errMsg } from "../lib/ipc";
import { basename, dirname, join, relative } from "../lib/paths";
import { confirmDialog, getState, setState, toast, useStore } from "../state/store";
import { tl } from "../i18n";
import { envKeys, exampleFrom, looksSecret, parseEnvLines, serializeEnv, setEnvValue, type EnvLine } from "./parse";

export const ENV_PREFIX = "nozel:env:";
export const isEnvFile = (p: string) => /(^|[\\/])\.env(\.[\w.-]+)?$/.test(p) && !/\.(example|sample|template|dist)$/i.test(p);

export function openEnvTab(path: string) {
  const id = ENV_PREFIX + path;
  if (!getState().tabs[id]) setState((s) => ({ tabs: { ...s.tabs, [id]: { id, name: `${basename(path)} · ${tl("tabel")}`, kind: "env", dirty: false, lang: "", preview: "code" } } }));
  showTab(id);
}

async function readText(path: string): Promise<string | null> {
  const open = docs.currentText(path);
  if (open !== null) return open;
  return api.readText(path).then((f) => f.content).catch(() => null);
}

const EXAMPLES = [".env.example", ".env.sample", ".env.template", ".env.dist"];

export interface EnvStatus {
  example: string | null;
  missing: string[];
  extra: string[];
  ignored: boolean | null;
}

export async function envStatus(path: string, keys: string[]): Promise<EnvStatus> {
  const dir = dirname(path);
  let example: string | null = null;
  let exKeys: string[] = [];
  for (const n of EXAMPLES) {
    const t = await api.readText(join(dir, n)).then((f) => f.content).catch(() => null);
    if (t !== null) {
      example = join(dir, n);
      exKeys = envKeys(parseEnvLines(t));
      break;
    }
  }
  const root = getState().root;
  const ignored = root ? await api.envGitIgnored(root, path).catch(() => null) : null;
  return { example, missing: exKeys.filter((k) => !keys.includes(k)), extra: example ? keys.filter((k) => !exKeys.includes(k)) : [], ignored };
}

export async function addToGitignore(path: string) {
  const root = getState().root;
  if (!root) return;
  const gi = join(root, ".gitignore");
  const old = await api.readText(gi).then((f) => f.content).catch(() => "");
  const rel = relative(root, path);
  const pattern = basename(path) === ".env" ? ".env" : rel;
  const add = [pattern, ...(pattern === ".env" ? [".env.*", "!.env.example"] : [])].filter((p) => !old.split(/\r?\n/).includes(p));
  await api.writeText(gi, `${old.replace(/\s*$/, "")}${old.trim() ? "\n\n" : ""}# Rahasia lingkungan\n${add.join("\n")}\n`);
  toast(tl("Ditambahkan ke .gitignore: {list}", { list: add.join(", ") }), "success");
}

export async function writeExample(path: string, lines: EnvLine[]) {
  const target = join(dirname(path), ".env.example");
  const exists = await api.readText(target).then(() => true).catch(() => false);
  if (exists && !(await confirmDialog(tl("Timpa .env.example?"), tl("Berkas sudah ada; isinya diganti dengan kunci dari {name} (tanpa nilai).", { name: basename(path) }), tl("Timpa"), true))) return;
  await api.writeText(target, exampleFrom(lines));
  toast(tl(".env.example dibuat tanpa nilai rahasia."), "success");
  void openFile(target);
}

export default function EnvTab({ tabId }: { tabId: string }) {
  const path = tabId.slice(ENV_PREFIX.length);
  const [lines, setLines] = useState<EnvLine[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<EnvStatus | null>(null);
  const [newKey, setNewKey] = useState("");
  const [filter, setFilter] = useState("");
  const editorDirty = useStore((s) => s.tabs[path]?.dirty);

  const load = async () => {
    const t = await readText(path);
    const l = parseEnvLines(t ?? "");
    setLines(l);
    setDirty(false);
    setStatus(await envStatus(path, envKeys(l)));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    const tab = getState().tabs[tabId];
    if (tab && tab.dirty !== dirty) setState((s) => ({ tabs: { ...s.tabs, [tabId]: { ...tab, dirty } } }));
  }, [dirty, tabId]);

  const pairs = useMemo(() => (lines ?? []).flatMap((l, i) => (l.kind === "pair" ? [{ ...l, i }] : [])), [lines]);
  if (!lines)
    return (
      <div className="pad">
        <Spinner />
      </div>
    );
  const update = (next: EnvLine[]) => {
    setLines(next);
    setDirty(true);
  };
  const save = async () => {
    if (editorDirty && !(await confirmDialog(tl("Berkas punya editan yang belum disimpan"), tl("Simpan dari tabel akan menimpa editan di tab {name}.", { name: basename(path) }), tl("Timpa"), true))) return;
    try {
      await api.writeText(path, serializeEnv(lines));
      setDirty(false);
      if (docs.getDoc(path)) await docs.reloadFromDisk(path);
      setStatus(await envStatus(path, envKeys(lines)));
      toast(tl("Tersimpan: {name}", { name: basename(path) }), "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };
  const add = (key: string, value = "") => {
    const k = key.trim();
    if (!/^[A-Za-z_][\w.-]*$/.test(k)) return toast(tl("Nama kunci tidak valid."), "error");
    if (envKeys(lines).includes(k)) return toast(tl("Kunci {key} sudah ada.", { key: k }));
    update(setEnvValue(lines, k, value));
    setNewKey("");
  };
  const toggle = (k: string) => setShown((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  const visible = pairs.filter((p) => !filter || p.key.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="db-tab env-tab">
      <div className="db-toolbar">
        <FileCode2 size={13} />
        <strong className="db-title">{getState().root ? relative(getState().root!, path) : path}</strong>
        <span className="hint">{tl("{n} kunci", { n: pairs.length })}</span>
        <span className="spacer" />
        <input className="input env-filter" placeholder={tl("Saring kunci…")} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={tl("Saring kunci")} />
        <button className="btn btn-sm" onClick={() => void openFile(path)}>
          {tl("Buka sebagai teks")}
        </button>
        <button className="btn btn-sm" onClick={() => void writeExample(path, lines)} title={tl("Kunci & komentar disalin, nilai dikosongkan")}>
          {tl("Buat .env.example")}
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={!dirty}>
          <Save size={12} /> {tl("Simpan")}
        </button>
      </div>
      {status?.ignored === false && (
        <div className="env-warn">
          <AlertTriangle size={13} />
          <span>{tl("{name} tidak diabaikan git — rahasia bisa ikut ter-commit.", { name: basename(path) })}</span>
          <button className="btn btn-sm" onClick={() => void addToGitignore(path).then(load)}>
            {tl("Tambahkan ke .gitignore")}
          </button>
        </div>
      )}
      {status?.ignored === true && (
        <div className="db-note">
          <ShieldCheck size={12} className="tone-success-fg" /> {tl("Diabaikan git.")}
        </div>
      )}
      {status && status.missing.length > 0 && (
        <div className="env-missing">
          <span>{tl("Ada di {name} tapi belum di sini:", { name: basename(status.example ?? "") })}</span>
          {status.missing.map((k) => (
            <button key={k} className="env-chip" onClick={() => add(k)} title={tl("Tambahkan {key}", { key: k })}>
              <Plus size={10} /> {k}
            </button>
          ))}
        </div>
      )}
      <div className="env-table" role="table">
        <div className="env-row env-head" role="row">
          <span role="columnheader">{tl("Kunci")}</span>
          <span role="columnheader">{tl("Nilai")}</span>
          <span role="columnheader">{tl("Komentar")}</span>
          <span />
        </div>
        {visible.map((p) => {
          const secret = looksSecret(p.key);
          const masked = secret && !shown.has(p.key);
          const extra = status?.extra.includes(p.key);
          return (
            <div key={p.key} className="env-row" role="row">
              <span className="env-key mono" title={extra ? tl("Tidak ada di .env.example") : p.key}>
                {p.key}
                {extra && <span className="env-extra">{tl("baru")}</span>}
              </span>
              <span className="env-val">
                {p.value.includes("\n") ? (
                  <textarea className="input mono" value={p.value} onChange={(e) => update(setEnvValue(lines, p.key, e.target.value))} aria-label={tl("Nilai {name}", { name: p.key })} rows={Math.min(6, p.value.split("\n").length)} />
                ) : (
                  <input className="input mono" type={masked ? "password" : "text"} value={p.value} onChange={(e) => update(setEnvValue(lines, p.key, e.target.value))} aria-label={tl("Nilai {name}", { name: p.key })} autoComplete="off" spellCheck={false} />
                )}
                {secret && (
                  <IconButton label={masked ? tl("Tampilkan nilai") : tl("Sembunyikan nilai")} onClick={() => toggle(p.key)}>
                    {masked ? <Eye size={12} /> : <EyeOff size={12} />}
                  </IconButton>
                )}
              </span>
              <input className="input env-comment" value={p.comment.replace(/^#\s?/, "")} placeholder="—" aria-label={tl("Komentar {name}", { name: p.key })} onChange={(e) => update(lines.map((l, j) => (j === p.i && l.kind === "pair" ? { ...l, comment: e.target.value ? `# ${e.target.value}` : "" } : l)))} />
              <IconButton label={tl("Hapus {key}", { key: p.key })} onClick={() => update(setEnvValue(lines, p.key, null))}>
                <Trash2 size={12} />
              </IconButton>
            </div>
          );
        })}
        <div className="env-row env-add" role="row">
          <input className="input mono" placeholder={tl("KUNCI_BARU")} value={newKey} onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^\w.-]/g, "_"))} onKeyDown={(e) => e.key === "Enter" && add(newKey)} aria-label={tl("Kunci baru")} />
          <button className="btn btn-sm" onClick={() => add(newKey)} disabled={!newKey}>
            <Plus size={12} /> {tl("Tambah")}
          </button>
        </div>
        {!pairs.length && <Empty title={tl("Belum ada variabel.")} />}
      </div>
    </div>
  );
}
