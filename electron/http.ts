// Klien HTTP untuk berkas .http dan panel API. Request dikirim dari main process (fetch Node) supaya
// tidak terkena CORS renderer; ada batas waktu, pembatalan, dan batas ukuran respons 20 MB.
// Placeholder {{$secret NAMA}} dan {{$dotenv NAMA}} baru diisi di sini: nilainya tidak pernah
// melewati renderer, riwayat, atau agen AI.

import fs from "node:fs";
import path from "node:path";
import { getSecret, setSecret } from "./secrets";
import type { Ctx } from "./util";
import { parseEnv } from "./db/detect";
import type { HttpRequest, HttpResponse } from "./httpTypes";

export type { HttpRequest, HttpResponse };

export const MAX_BODY = 20 * 1024 * 1024;
const TEXT_TYPE = /^(text\/|application\/(json|[\w.+-]*\+json|xml|[\w.+-]*\+xml|javascript|x-www-form-urlencoded|graphql|yaml|x-yaml|ld\+json|problem\+json))/i;

const secretKey = (name: string) => `http:${name}`;
const validName = (n: string) => /^[\w.-]{1,80}$/.test(n);

export function setHttpSecret(ctx: Ctx, name: string, value: string | null) {
  if (!validName(name)) throw new Error("Nama rahasia hanya huruf, angka, titik, garis bawah, atau strip.");
  setSecret(ctx, secretKey(name), value);
  const list = new Set(listHttpSecrets(ctx));
  if (value === null) list.delete(name);
  else list.add(name);
  fs.mkdirSync(ctx.userData, { recursive: true });
  fs.writeFileSync(path.join(ctx.userData, "http-secrets.json"), JSON.stringify([...list].sort()));
}

/** Nama rahasia yang tersimpan (nilainya tidak pernah dikembalikan). */
export function listHttpSecrets(ctx: Ctx): string[] {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ctx.userData, "http-secrets.json"), "utf8"));
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string" && validName(x)) : [];
  } catch {
    return [];
  }
}

function dotenv(root: string | null | undefined): Record<string, string> {
  if (!root) return {};
  const out: Record<string, string> = {};
  for (const n of [".env", ".env.local"]) {
    try {
      Object.assign(out, parseEnv(fs.readFileSync(path.join(root, n), "utf8")));
    } catch {
      /* tidak ada */
    }
  }
  return out;
}

/** Isi {{$secret X}} dan {{$dotenv X}}; placeholder yang tidak ditemukan menggagalkan request. */
export function fillPrivate(ctx: Ctx, s: string, env: () => Record<string, string>): string {
  return s.replace(/\{\{\s*\$(secret|dotenv)\s+([\w.-]+)\s*\}\}/g, (_m, kind: string, name: string) => {
    const v = kind === "secret" ? getSecret(ctx, secretKey(name)) : env()[name];
    if (v === null || v === undefined) throw new Error(kind === "secret" ? `Rahasia "${name}" belum disimpan (panel API → Rahasia).` : `${name} tidak ada di .env project.`);
    return v;
  });
}

const running = new Map<string, AbortController>();

export function cancelHttp(id: string) {
  running.get(id)?.abort();
}

export async function sendHttp(ctx: Ctx, id: string, req: HttpRequest): Promise<HttpResponse> {
  let envCache: Record<string, string> | null = null;
  const env = () => (envCache ??= dotenv(req.root));
  const fill = (s: string) => fillPrivate(ctx, s, env);
  const url = fill(req.url.trim());
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL tidak valid: ${req.url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Hanya URL http:// atau https://.");
  const method = (req.method || "GET").toUpperCase();
  if (!/^[A-Z]{3,10}$/.test(method)) throw new Error(`Method tidak valid: ${method}`);
  const headers = new Headers();
  for (const [k, v] of req.headers) {
    if (!k.trim()) continue;
    headers.append(k.trim(), fill(v));
  }
  if (!headers.has("user-agent")) headers.set("user-agent", "AlexelStudio-HTTP/1.0");
  let body: RequestInit["body"];
  if (req.bodyFile) {
    const p = path.resolve(req.baseDir ?? req.root ?? ".", req.bodyFile);
    const st = fs.statSync(p);
    if (st.size > MAX_BODY) throw new Error("Berkas body lebih dari 20 MB.");
    body = new Uint8Array(fs.readFileSync(p));
  } else if (req.body !== undefined && req.body !== null && req.body !== "") body = fill(req.body);
  if (body !== undefined && (method === "GET" || method === "HEAD")) body = undefined;

  const ac = new AbortController();
  running.set(id, ac);
  const timeout = Math.max(1000, Math.min(req.timeoutMs ?? 60_000, 600_000));
  const timer = setTimeout(() => ac.abort(new Error("timeout")), timeout);
  const t0 = performance.now();
  try {
    const res = await fetch(parsed, { method, headers, body, signal: ac.signal, redirect: req.followRedirects === false ? "manual" : "follow" });
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    }
    const ms = Math.round(performance.now() - t0);
    const buf = Buffer.concat(chunks);
    const contentType = res.headers.get("content-type") ?? "";
    const isText = TEXT_TYPE.test(contentType) || (!contentType && !buf.subarray(0, 512).includes(0));
    return {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers.entries()],
      text: isText ? buf.toString("utf8") : null,
      base64: isText ? null : buf.toString("base64"),
      contentType,
      size,
      truncated,
      ms,
      url: res.url || parsed.toString(),
      redirected: res.redirected,
    };
  } catch (e) {
    if (ac.signal.aborted) throw new Error(ac.signal.reason instanceof Error && ac.signal.reason.message === "timeout" ? `Tidak ada respons dalam ${Math.round(timeout / 1000)} detik.` : "Request dibatalkan.");
    const err = e as Error & { cause?: { code?: string; message?: string } };
    throw new Error(err.cause?.code ? `${err.cause.code}: ${err.cause.message ?? err.message}` : err.message);
  } finally {
    clearTimeout(timer);
    running.delete(id);
  }
}
