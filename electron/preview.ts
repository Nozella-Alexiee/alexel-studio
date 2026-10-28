// Protokol nozelpreview:// untuk pratinjau HTML. Hanya berkas di dalam folder project yang dilayani;
// isi yang belum disimpan bisa ditimpa supaya pratinjau ikut ketikan.

import fs from "node:fs";
import path from "node:path";

let root: string | null = null;
const overrides = new Map<string, string>();

const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

export function setRoot(r: string | null) {
  root = r ? real(r) : null;
  overrides.clear();
}

export function setOverride(p: string, content: string | null) {
  const k = real(p);
  if (content === null) overrides.delete(k);
  else overrides.set(k, content);
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wasm: "application/wasm",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  md: "text/plain; charset=utf-8",
};

export interface PreviewResponse {
  status: number;
  mime: string;
  body: Buffer | string;
}

export function resolvePreview(urlPath: string): PreviewResponse {
  let p = decodeURIComponent(urlPath);
  if (process.platform === "win32") p = p.replace(/^\/([A-Za-z]:)/, "$1");
  try {
    if (fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  } catch {
    /* tidak ada */
  }
  if (!root) return { status: 403, mime: "text/plain", body: "Belum ada project terbuka." };
  const canon = real(p);
  if (canon !== root && !canon.startsWith(root + path.sep)) return { status: 403, mime: "text/plain", body: "Di luar folder project." };
  const mime = MIME[path.extname(canon).slice(1).toLowerCase()] ?? "application/octet-stream";
  const o = overrides.get(canon);
  if (o !== undefined) return { status: 200, mime, body: o };
  try {
    return { status: 200, mime, body: fs.readFileSync(canon) };
  } catch {
    return { status: 404, mime: "text/plain", body: "Tidak ditemukan." };
  }
}
