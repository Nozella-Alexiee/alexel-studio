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
  history: HistoryEntry[];
  /** Request yang ditampilkan di tab respons. */
  current: string | null;
  /** Draf builder per id tab. */
  drafts: Record<string, SimpleRequest>;
}

/**
 * Entri riwayat: request dalam bentuk template (SEBELUM substitusi {{var}}), supaya nilai environment
 * privat, token dari respons bernama, dsb. tidak tersimpan sebagai teks biasa di localStorage.
 * v=2 menandai entri format ini; entri lama (tanpa v) sudah tersubstitusi dan disaring saat dimuat.
 */
export interface HistoryEntry {
  req: SimpleRequest;
  at: number;
  status?: number;
  v?: 2;
}

const HISTORY_KEY = "alexel.http.history";
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|apikey|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$|token|secret|passw|api[-_]?key|session/i;
const SENSITIVE_PARAM = /^(access_token|refresh_token|id_token|token|api_key|apikey|api-key|key|secret|client_secret|password|passwd|pwd|sig|signature|auth|session|sessionid)$/i;
const SENSITIVE_BODY = /pass(word|wd)?|secret|token|api[-_]?key|authorization|credential/i;
const PLACEHOLDER = /\{\{\s*[^{}]+?\s*\}\}/g;

/** Nilai header sensitif boleh disimpan hanya bila isinya placeholder (mis. "Bearer {{token}}"). */
function safeHeaderValue(name: string, value: string): string {
  if (!SENSITIVE_HEADER.test(name)) return value;
  if (!/\{\{\s*[^{}]+?\s*\}\}/.test(value)) return "";
  const rest = value.replace(PLACEHOLDER, "").trim();
  return !rest || /^(bearer|basic|token|digest|apikey)$/i.test(rest) ? value : "";
}

/** Kosongkan nilai parameter query sensitif yang bukan placeholder. */
function safeUrl(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const [query, hash = ""] = url.slice(q + 1).split(/#(.*)/s);
  const parts = query.split("&").map((kv) => {
    const eq = kv.indexOf("=");
    if (eq < 0) return kv;
    const k = kv.slice(0, eq);
    const v = kv.slice(eq + 1);
    let name = k;
    try {
      name = decodeURIComponent(k);
    } catch {
      /* biarkan apa adanya */
    }
    return SENSITIVE_PARAM.test(name) && !/^\{\{[^{}]+\}\}$/.test(v.trim()) ? `${k}=` : kv;
  });
  return `${url.slice(0, q)}?${parts.join("&")}${hash ? `#${hash}` : ""}`;
}

const SENSITIVE_KEY = /pass(word|wd)|^pwd$|secret|token|api[-_]?key|authorization|credential|private[-_]?key|^otp$|^pin$/i;
const ONLY_PLACEHOLDER = /^\{\{\s*[^{}]+?\s*\}\}$/;

/**
 * Kosongkan nilai rahasia yang ditulis langsung di body: properti JSON (bersarang pun) dan pasangan
 * form-urlencoded dengan nama sensitif. Nilai yang hanya berupa placeholder ({{password}}) dibiarkan.
 * Bekerja pada teks, karena body template sering bukan JSON sah (mis. "pin": {{pin}}).
 */
export function safeBody(body: string | null): string | null {
  if (!body) return body;
  let out = body.replace(/("((?:[^"\\]|\\.)*)"\s*:\s*)("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false)/g, (m, head: string, key: string, val: string) => {
    if (!SENSITIVE_KEY.test(key)) return m;
    if (val.startsWith('"') && ONLY_PLACEHOLDER.test(val.slice(1, -1).trim())) return m;
    return `${head}${val.startsWith('"') ? '""' : "null"}`;
  });
  const t = out.trim();
  if (/^[^=&\s{[<]+=[^&\n]*(&[^=&\s]+=[^&\n]*)*$/.test(t)) {
    out = t
      .split("&")
      .map((kv) => {
        const eq = kv.indexOf("=");
        let name = kv.slice(0, eq);
        try {
          name = decodeURIComponent(name.replace(/\+/g, " "));
        } catch {
          /* biarkan apa adanya */
        }
        return SENSITIVE_KEY.test(name) && !ONLY_PLACEHOLDER.test(kv.slice(eq + 1).trim()) ? kv.slice(0, eq + 1) : kv;
      })
      .join("&");
  }
  return out;
}

/** Bentuk request yang aman disimpan di riwayat. `legacy` = entri lama yang sudah tersubstitusi. */
export function historySafe(req: SimpleRequest, legacy = false): SimpleRequest {
  const body = legacy && req.body && SENSITIVE_BODY.test(req.body) ? null : safeBody(req.body);
  return { method: req.method, url: safeUrl(req.url), headers: req.headers.map(([k, v]) => [k, safeHeaderValue(k, v)] as [string, string]), body };
}

/** Ada header rahasia yang nilainya dikosongkan saat disimpan ke riwayat? */
export function historyHasBlankSecrets(req: SimpleRequest): boolean {
  if (req.headers.some(([k, v]) => SENSITIVE_HEADER.test(k) && !v.trim())) return true;
  for (const m of (req.body ?? "").matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*(""|null)/g)) if (SENSITIVE_KEY.test(m[1])) return true;
  return false;
}

/** Muat riwayat; entri lama yang berisi hasil substitusi disaring dan ditulis ulang. */
export function loadHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
    if (!Array.isArray(raw)) return [];
    let changed = false;
    const list = raw
      .filter((h) => h && h.req && typeof h.req.url === "string")
      .map((h) => {
        if (h.v === 2) {
          // Entri v2 dari 1.0.0 belum menyaring rahasia di body.
          const body = safeBody(h.req.body ?? null);
          if (body === (h.req.body ?? null)) return h;
          changed = true;
          return { ...h, req: { ...h.req, body } };
        }
        changed = true;
        return { req: historySafe({ ...h.req, headers: Array.isArray(h.req.headers) ? h.req.headers : [] }, true), at: h.at, status: h.status, v: 2 as const };
      });
    if (changed) localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

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

/** Nomor urut send() per key: respons dari pengiriman yang sudah digantikan diabaikan. */
const sendSeq = new Map<string, number>();

export async function send(key: string, input: SendInput): Promise<Exchange | null> {
  const req = resolveRequest(input);
  // Riwayat memakai template (sebelum substitusi), bukan `req`.
  const template: SimpleRequest = { method: input.method, url: input.url, headers: input.headers, body: input.body };
  const missing = [...new Set([req.url, ...req.headers.map((h) => h[1]), req.body ?? ""].flatMap(unresolved))];
  if (missing.length) {
    toast(tl("Variabel belum diisi: {names}", { names: missing.join(", ") }), "error");
    return null;
  }
  const token = (sendSeq.get(key) ?? 0) + 1;
  sendSeq.set(key, token);
  const stale = () => sendSeq.get(key) !== token;
  const ex: Exchange = { key, req, at: Date.now(), running: true };
  set((s) => ({ exchanges: { ...s.exchanges, [key]: ex } }));
  openResponse(key);
  try {
    const res = await api.httpSend(key, { method: req.method, url: req.url, headers: req.headers, body: req.body, bodyFile: input.bodyFile ?? null, baseDir: input.baseDir ?? null, root: appState().root, timeoutMs: (appState().settings.httpTimeout ?? 60) * 1000 });
    // Sudah ada send() lebih baru untuk key ini: jangan timpa hasilnya dengan respons lama.
    if (stale()) return null;
    const done: Exchange = { ...ex, running: false, res };
    set((s) => ({ exchanges: { ...s.exchanges, [key]: done }, named: input.name ? { ...s.named, [input.name]: res } : s.named }));
    pushHistory(template, res.status);
    return done;
  } catch (e) {
    if (stale()) return null;
    const done: Exchange = { ...ex, running: false, error: errMsg(e) };
    set((s) => ({ exchanges: { ...s.exchanges, [key]: done } }));
    pushHistory(template);
    return done;
  }
}

export const cancelSend = (key: string) => api.httpCancel(key).catch(() => {});

function pushHistory(template: SimpleRequest, status?: number) {
  const req = historySafe(template);
  const history: HistoryEntry[] = [{ req, at: Date.now(), status, v: 2 as const }, ...get().history.filter((h) => !(h.req.method === req.method && h.req.url === req.url && h.req.body === req.body))].slice(0, 100);
  set({ history });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* opsional */
  }
}

export function clearHistory() {
  set({ history: [] });
  try {
    localStorage.removeItem(HISTORY_KEY);
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
