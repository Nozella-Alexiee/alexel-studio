// Webview dari ekstensi: HTML disimpan di main process dan disajikan lewat skema `nozelweb://` ke iframe
// ber-sandbox (origin terpisah dari aplikasi, tanpa allow-same-origin). Berkas lokal (asWebviewUri) hanya
// dilayani dari folder yang diizinkan panelnya (folder ekstensi, project, localResourceRoots).

import fs from "node:fs";
import path from "node:path";

interface Panel {
  html: string;
  roots: string[];
}
const panels = new Map<number, Panel>();

export const webviewCreate = (id: number, roots: string[]) => panels.set(id, { html: "", roots: roots.map((r) => path.resolve(r)) });
export const webviewHtml = (id: number, html: string) => {
  const p = panels.get(id);
  if (p) p.html = html;
};
export const webviewDispose = (id: number) => panels.delete(id);

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm", ".map": "application/json", ".txt": "text/plain", ".md": "text/markdown", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm" };

/** Skrip awal: API acquireVsCodeApi + penerapan tema dari aplikasi (variabel --vscode-*). */
export const bootstrap = (id: number) =>
  `<script>(function(){var id=${id};var state;var api={postMessage:function(m){parent.postMessage({__alexelWebview:id,type:"msg",message:m},"*")},getState:function(){return state},setState:function(s){state=s;parent.postMessage({__alexelWebview:id,type:"state",state:s},"*");return s}};window.acquireVsCodeApi=function(){return api};window.addEventListener("message",function(e){var d=e.data;if(d&&d.__alexelTheme){var r=document.documentElement;for(var k in d.vars)r.style.setProperty(k,d.vars[k]);r.classList.remove("vscode-dark","vscode-light");r.classList.add(d.dark?"vscode-dark":"vscode-light");document.body&&(document.body.classList.remove("vscode-dark","vscode-light"),document.body.classList.add(d.dark?"vscode-dark":"vscode-light"));e.stopImmediatePropagation()}},true)})();</script>`;

export interface WebResponse {
  status: number;
  body: string | Buffer;
  mime: string;
  csp?: boolean;
}

/** Selesaikan URL `nozelweb://v/<id>/…` (dokumen) atau `nozelweb://r/<id>/<path ter-encode>` (sumber daya). */
export function resolveWebview(url: string): WebResponse {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const id = Number(parts[0]);
  const panel = panels.get(id);
  if (!panel) return { status: 404, body: "Not found", mime: "text/plain" };
  if (u.host === "v") {
    // Skrip awal harus jalan sebelum skrip halaman: taruh paling atas dokumen.
    const html = panel.html || "<!doctype html><html><body></body></html>";
    const injected = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + bootstrap(id)) : bootstrap(id) + html;
    return { status: 200, body: injected, mime: "text/html; charset=utf-8", csp: true };
  }
  if (u.host === "r") {
    const rel = decodeURIComponent(parts.slice(1).join("/"));
    // Bentuk yang dikenali: "/abs/path" (encode utuh), "abs/path" (posix tanpa "/" awal), "C:/path" (Windows).
    const file = path.resolve(/^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith("/") ? rel : "/" + rel);
    const ok = panel.roots.some((r) => file === r || file.startsWith(r + path.sep));
    if (!ok) return { status: 403, body: "Forbidden", mime: "text/plain" };
    try {
      return { status: 200, body: fs.readFileSync(file), mime: MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" };
    } catch {
      return { status: 404, body: "Not found", mime: "text/plain" };
    }
  }
  return { status: 404, body: "Not found", mime: "text/plain" };
}
