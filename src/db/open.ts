// Tab database: tabel (grid), konsol query, diagram ER. Id tab menyandikan koneksi + objek.

import { showTab } from "../app/actions";
import { getState, setState } from "../state/store";
import { tl } from "../i18n";

export type DbView = "table" | "console" | "er";

export interface DbTabRef {
  view: DbView;
  conn: string;
  schema: string | null;
  table: string | null;
}

const enc = (s: string | null) => encodeURIComponent(s ?? "");

export const dbTabId = (r: DbTabRef) => `nozel:db:${r.view}:${enc(r.conn)}:${r.schema === null ? "~" : enc(r.schema)}:${enc(r.table)}`;

export function parseDbTab(id: string): DbTabRef | null {
  const m = /^nozel:db:(table|console|er):([^:]*):([^:]*):([^:]*)$/.exec(id);
  if (!m) return null;
  return { view: m[1] as DbView, conn: decodeURIComponent(m[2]), schema: m[3] === "~" ? null : decodeURIComponent(m[3]), table: m[4] ? decodeURIComponent(m[4]) : null };
}

/** Konsol yang dibuka dengan kotak "Tanya data" langsung aktif. */
export const pendingAi = new Set<string>();

export function openDbTab(view: DbView, conn: string, schema: string | null, table: string | null, title: string, o: { ai?: boolean } = {}) {
  const id = dbTabId({ view, conn, schema, table });
  if (o.ai) pendingAi.add(id);
  if (!getState().tabs[id]) {
    const name = view === "console" ? tl("Query: {name}", { name: title }) : view === "er" ? tl("ER: {name}", { name: title }) : title;
    setState((s) => ({ tabs: { ...s.tabs, [id]: { id, name, kind: "db", dirty: false, lang: "", preview: "code" } } }));
  }
  showTab(id);
}
