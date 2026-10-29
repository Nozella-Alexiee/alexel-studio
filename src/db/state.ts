// Keadaan klien database di renderer: daftar koneksi, cache skema, saran dari project, hasil query
// (panel bawah "Hasil"), dan koneksi pilihan per berkas .sql.

import { create } from "zustand";
import { isWrite } from "../../electron/db/risk";
import type { DbConnection, DbKind, DbSchema, QueryResult } from "../../electron/db/types";
import { api, errMsg, type DbDetected } from "../lib/ipc";
import { confirmDialog, getState as appState, setLayout, toast } from "../state/store";
import { tl } from "../i18n";

export type Conn = DbConnection & { connected?: boolean };

export interface ResultEntry {
  key: number;
  connId: string;
  connName: string;
  text: string;
  at: number;
  result?: QueryResult;
  error?: string;
  running?: boolean;
}

interface DbState {
  conns: Conn[];
  schemas: Record<string, DbSchema[] | undefined>;
  loading: Record<string, boolean>;
  errors: Record<string, string | undefined>;
  detected: DbDetected[];
  /** Berkas query → id koneksi. */
  fileConn: Record<string, string>;
  results: ResultEntry[];
  activeResult: number | null;
  /** Dialog koneksi: null = tertutup. */
  editing: (Partial<DbConnection> & { password?: string }) | null;
}

export const useDb = create<DbState>(() => ({ conns: [], schemas: {}, loading: {}, errors: {}, detected: [], fileConn: {}, results: [], activeResult: null, editing: null }));
const set = useDb.setState;
const get = useDb.getState;

export const KIND_LABEL: Record<DbKind, string> = { postgres: "PostgreSQL", mysql: "MySQL / MariaDB", sqlite: "SQLite", mongodb: "MongoDB", redis: "Redis" };
export const isSql = (k: DbKind) => k === "postgres" || k === "mysql" || k === "sqlite";
export const connById = (id: string) => get().conns.find((c) => c.id === id);

let fileConnLoaded = false;
function loadFileConn() {
  if (fileConnLoaded) return;
  fileConnLoaded = true;
  try {
    set({ fileConn: JSON.parse(localStorage.getItem("alexel.db.fileConn") ?? "{}") });
  } catch {
    /* kosong */
  }
}

export function setFileConn(path: string, id: string) {
  const fileConn = { ...get().fileConn, [path]: id };
  set({ fileConn });
  try {
    localStorage.setItem("alexel.db.fileConn", JSON.stringify(fileConn));
  } catch {
    /* opsional */
  }
}

export async function refreshConns() {
  loadFileConn();
  try {
    set({ conns: await api.dbList() });
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function refreshDetected() {
  const root = appState().root;
  if (!root) return set({ detected: [] });
  try {
    const list = await api.dbDetect(root);
    const have = new Set(get().conns.map((c) => c.kind + (c.url ?? c.file)));
    set({ detected: list.filter((d) => !have.has(d.kind + (d.url ?? d.file))) });
  } catch {
    set({ detected: [] });
  }
}

export async function addDetected(d: DbDetected) {
  const root = appState().root;
  if (!root) return;
  try {
    const c = await api.dbAddDetected(root, d.key);
    await refreshConns();
    set((s) => ({ detected: s.detected.filter((x) => x.key !== d.key) }));
    toast(tl("Koneksi {name} ditambahkan", { name: c.name }), "success");
    void loadSchema(c.id);
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function loadSchema(id: string, force = false) {
  if (!force && get().schemas[id]) return get().schemas[id];
  set((s) => ({ loading: { ...s.loading, [id]: true }, errors: { ...s.errors, [id]: undefined } }));
  try {
    const schema = await api.dbSchema(id);
    set((s) => ({ schemas: { ...s.schemas, [id]: schema }, conns: s.conns.map((c) => (c.id === id ? { ...c, connected: true } : c)) }));
    return schema;
  } catch (e) {
    set((s) => ({ errors: { ...s.errors, [id]: errMsg(e) } }));
    return undefined;
  } finally {
    set((s) => ({ loading: { ...s.loading, [id]: false } }));
  }
}

export async function disconnect(id: string) {
  await api.dbDisconnect(id).catch(() => {});
  set((s) => ({ conns: s.conns.map((c) => (c.id === id ? { ...c, connected: false } : c)), schemas: { ...s.schemas, [id]: undefined } }));
}

export async function removeConn(id: string) {
  const c = connById(id);
  if (!c || !(await confirmDialog(tl("Hapus koneksi {name}?", { name: c.name }), tl("Profil dan password tersimpan dihapus dari Alexel Studio. Database-nya tidak diubah."), tl("Hapus"), true))) return;
  await api.dbRemove(id);
  set((s) => ({ schemas: { ...s.schemas, [id]: undefined } }));
  await refreshConns();
  void refreshDetected();
}

/**
 * Query di koneksi produksi yang perlu konfirmasi. SQL memakai aturan yang sama dengan main process
 * (semua statement diperiksa, jadi "SELECT 1; UPDATE …" atau CTE yang menulis tidak lolos).
 */
export function prodNeedsConfirm(kind: DbKind, text: string): boolean {
  if (isSql(kind)) return isWrite(text);
  if (kind === "redis") {
    // Satu berkas bisa berisi banyak perintah (per baris): semuanya harus baca.
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("//") && !/^@key\s+/.test(l));
    return !lines.length || lines.some((l) => !/^(get|hget|hgetall|hkeys|hlen|mget|scan|hscan|sscan|zscan|keys|info|type|ttl|pttl|exists|strlen|llen|lrange|scard|smembers|zcard|zrange|dbsize|ping)(\s|$)/i.test(l));
  }
  // aggregate dengan $out/$merge menulis koleksi.
  return !/^\s*db\.\w+\.(find|findOne|aggregate|count|countDocuments|distinct)\(/i.test(text) || /\$(out|merge)\b/.test(text);
}

/** Jalankan query; query berisiko meminta konfirmasi lalu diulang dengan `confirmed`. */
export async function runQuery(id: string, text: string, o: { limit?: number; showPanel?: boolean } = {}): Promise<QueryResult | null> {
  const c = connById(id);
  if (!c) return null;
  const key = Date.now() + Math.random();
  const entry: ResultEntry = { key, connId: id, connName: c.name, text, at: Date.now(), running: true };
  set((s) => ({ results: [entry, ...s.results].slice(0, 30), activeResult: key }));
  if (o.showPanel !== false) setLayout({ panel: true, panelTab: "db" });
  const patch = (p: Partial<ResultEntry>) => set((s) => ({ results: s.results.map((r) => (r.key === key ? { ...r, ...p } : r)) }));
  let confirmed = false;
  for (;;) {
    try {
      if (c.env === "prod" && !confirmed && prodNeedsConfirm(c.kind, text)) {
        if (!(await confirmDialog(tl("Jalankan di produksi?"), tl("Koneksi {name} ditandai produksi.", { name: c.name }), tl("Jalankan"), true))) {
          patch({ running: false, error: tl("Dibatalkan.") });
          return null;
        }
        confirmed = true;
      }
      const result = await api.dbQuery(id, text, { limit: o.limit ?? appState().settings.dbRowLimit ?? 1000, confirmed });
      patch({ running: false, result });
      set((s) => ({ conns: s.conns.map((x) => (x.id === id ? { ...x, connected: true } : x)) }));
      if (/^\s*(create|drop|alter)\b/i.test(text) || /\b(createCollection|drop)\(/.test(text)) void loadSchema(id, true);
      return result;
    } catch (e) {
      const msg = errMsg(e);
      if (msg.startsWith("CONFIRM:") && !confirmed) {
        if (await confirmDialog(tl("Query berisiko"), tl(msg.slice(8)), tl("Tetap jalankan"), true)) {
          confirmed = true;
          continue;
        }
        patch({ running: false, error: tl("Dibatalkan.") });
        return null;
      }
      patch({ running: false, error: tl(msg) });
      return null;
    }
  }
}

export const cancelQuery = (id: string) => api.dbCancel(id).catch(() => {});

/** Nama tabel/kolom dari skema untuk autocomplete `@codemirror/lang-sql`. */
export function completionSchema(schemas: DbSchema[] | undefined, kind: DbKind): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of schemas ?? []) {
    for (const t of s.tables) {
      const cols = t.columns.map((c) => c.name);
      out[t.name] = cols;
      if (kind === "postgres" && s.name !== "public") out[`${s.name}.${t.name}`] = cols;
      if (kind === "mysql") out[`${s.name}.${t.name}`] = cols;
    }
  }
  return out;
}
