// Keadaan klien HTTP: environment project, rahasia (nama saja), respons per request & per nama
// (untuk {{nama.response…}}), riwayat, dan tab builder/respons.

import { create } from "zustand";
import type { HttpResponse } from "../../electron/httpTypes";
import { showTab } from "../app/actions";
import { api, errMsg } from "../lib/ipc";
import { join } from "../lib/paths";
import { getState as appState, setState as appSet, toast } from "../state/store";
import { tl } from "../i18n";
import { mergeEnvFiles, substitute, unresolved, type SimpleRequest } from "./parse";

export interface SendInput extends SimpleRequest {
  name?: string | null;
  bodyFile?: string | null;
  /** Folder berkas .http (untuk `< ./berkas`). */
  baseDir?: string | null;
  /** Variabel berkas .http. */
  vars?: Record<string, string>;
}

export interface Exchange {
  key: string;
  /** Request setelah substitusi (placeholder $secret/$dotenv tetap utuh). */
  req: SimpleRequest;
  at: number;
  res?: HttpResponse;
  error?: string;
  running?: boolean;
}

interface HttpState {
  envs: Record<string, Record<string, string>>;
  env: string | null;
  secrets: string[];
  exchanges: Record<string, Exchange>;
  /** Respons terakhir per `# @name`. */
  named: Record<string, HttpResponse>;
  history: { req: SimpleRequest; at: number; status?: number }[];
  /** Request yang ditampilkan di tab respons. */
  current: string | null;
  /** Draf builder per id tab. */
  drafts: Record<string, SimpleRequest>;
}

const loadHistory = () => {
  try {
    return JSON.parse(localStorage.getItem("alexel.http.history") ?? "[]") as HttpState["history"];
  } catch {
    return [];
  }
};

export const useHttp = create<HttpState>(() => ({ envs: {}, env: null, secrets: [], exchanges: {}, named: {}, history: loadHistory(), current: null, drafts: {} }));
const set = useHttp.setState;
const get = useHttp.getState;

export const RESPONSE_TAB = "nozel:http:response";

export async function loadEnvs() {
  const root = appState().root;
  const read = (p: string) => api.readText(p).then((f) => f.content).catch(() => null);
  const envs = root ? mergeEnvFiles(await read(join(root, "http-client.env.json")), await read(join(root, "http-client.private.env.json")), await read(join(root, ".vscode", "settings.json"))) : {};
  let env = get().env;
  try {
    env = localStorage.getItem(`alexel.http.env:${root}`) ?? env;
  } catch {
    /* opsional */
  }
  if (env && !envs[env]) env = null;
  if (!env) env = envs.dev ? "dev" : envs.local ? "local" : Object.keys(envs)[0] ?? null;
  set({ envs, env });
  void api.httpSecrets().then((secrets) => set({ secrets })).catch(() => {});
}

export function setEnv(env: string | null) {
  set({ env });
  try {
    localStorage.setItem(`alexel.http.env:${appState().root}`, env ?? "");
  } catch {
    /* opsional */
  }
}

/** Nilai environment aktif (`$shared` digabung seperti REST Client). */
export function envValues(): Record<string, string> {
  const s = get();
  return { ...(s.envs.$shared ?? {}), ...(s.env ? s.envs[s.env] ?? {} : {}) };
}

export function resolveRequest(r: SendInput): SimpleRequest {
  const ctx = { vars: r.vars ?? {}, env: envValues(), responses: Object.fromEntries(Object.entries(get().named).map(([k, v]) => [k, { status: v.status, headers: v.headers, text: v.text }])) };
  return { method: r.method, url: substitute(r.url, ctx), headers: r.headers.map(([k, v]) => [k, substitute(v, ctx)] as [string, string]), body: r.body === null ? null : substitute(r.body, ctx) };
}

function openResponse(key: string) {
  set({ current: key });
  if (!appState().tabs[RESPONSE_TAB]) appSet((s) => ({ tabs: { ...s.tabs, [RESPONSE_TAB]: { id: RESPONSE_TAB, name: tl("Respons"), kind: "http", dirty: false, lang: "", preview: "code" } } }));
  // Respons di sisi kanan (grup 2) seperti REST Client; dari builder, respons tampil di tab builder itu sendiri.
  if (!key.startsWith("nozel:http:req:")) showTab(RESPONSE_TAB, 1);
}

export async function send(key: string, input: SendInput): Promise<Exchange | null> {
  const req = resolveRequest(input);
  const missing = [...new Set([req.url, ...req.headers.map((h) => h[1]), req.body ?? ""].flatMap(unresolved))];
  if (missing.length) {
    toast(tl("Variabel belum diisi: {names}", { names: missing.join(", ") }), "error");
    return null;
  }
  const ex: Exchange = { key, req, at: Date.now(), running: true };
  set((s) => ({ exchanges: { ...s.exchanges, [key]: ex } }));
  openResponse(key);
  try {
    const res = await api.httpSend(key, { method: req.method, url: req.url, headers: req.headers, body: req.body, bodyFile: input.bodyFile ?? null, baseDir: input.baseDir ?? null, root: appState().root, timeoutMs: (appState().settings.httpTimeout ?? 60) * 1000 });
    const done: Exchange = { ...ex, running: false, res };
    set((s) => ({ exchanges: { ...s.exchanges, [key]: done }, named: input.name ? { ...s.named, [input.name]: res } : s.named }));
    pushHistory(req, res.status);
    return done;
  } catch (e) {
    const done: Exchange = { ...ex, running: false, error: errMsg(e) };
    set((s) => ({ exchanges: { ...s.exchanges, [key]: done } }));
    pushHistory(req);
    return done;
  }
}

export const cancelSend = (key: string) => api.httpCancel(key).catch(() => {});

function pushHistory(req: SimpleRequest, status?: number) {
  const history = [{ req, at: Date.now(), status }, ...get().history.filter((h) => !(h.req.method === req.method && h.req.url === req.url && h.req.body === req.body))].slice(0, 100);
  set({ history });
  try {
    localStorage.setItem("alexel.http.history", JSON.stringify(history));
  } catch {
    /* opsional */
  }
}

export function clearHistory() {
  set({ history: [] });
  try {
    localStorage.removeItem("alexel.http.history");
  } catch {
    /* opsional */
  }
}

let seq = 0;
/** Tab builder request baru (opsional terisi, mis. dari cURL atau riwayat). */
export function openBuilder(req?: Partial<SimpleRequest>) {
  const id = `nozel:http:req:${Date.now().toString(36)}${seq++}`;
  const draft: SimpleRequest = { method: req?.method ?? "GET", url: req?.url ?? "", headers: req?.headers ?? [], body: req?.body ?? null };
  set((s) => ({ drafts: { ...s.drafts, [id]: draft } }));
  const name = draft.url ? `${draft.method} ${draft.url.replace(/^https?:\/\//, "").slice(0, 30)}` : tl("Request baru");
  appSet((s) => ({ tabs: { ...s.tabs, [id]: { id, name, kind: "http", dirty: false, lang: "", preview: "code" } } }));
  showTab(id);
}

export async function saveSecret(name: string, value: string | null) {
  try {
    await api.httpSecretSet(name, value);
    set({ secrets: await api.httpSecrets() });
  } catch (e) {
    toast(errMsg(e), "error");
  }
}
