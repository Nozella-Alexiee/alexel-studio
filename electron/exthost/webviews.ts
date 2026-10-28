// Webview dari ekstensi: HTML disimpan di main process dan disajikan lewat skema `nozelweb://` ke iframe
// ber-sandbox (origin terpisah dari aplikasi, tanpa allow-same-origin). Berkas lokal (asWebviewUri) hanya
// dilayani dari folder yang diizinkan panelnya (folder ekstensi, project, localResourceRoots).

import fs from "node:fs";
import path from "node:path";

/**
 * Origin tiap ekstensi berbeda (host `w<hash>`): webview boleh memakai localStorage/IndexedDB miliknya
 * sendiri (allow-same-origin) tanpa bisa membaca penyimpanan ekstensi lain atau aplikasi (app://).
 */
export function ownerHost(owner: string | undefined): string {
  let h = 0x811c9dc5;
  for (const c of owner ?? "anon") h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return `w${h.toString(16).padStart(8, "0")}`;
}

interface Panel {
  html: string;
  roots: string[];
  host: string;
}
const panels = new Map<number, Panel>();

export const webviewCreate = (id: number, roots: string[], owner?: string) => panels.set(id, { html: "", roots: roots.map((r) => path.resolve(r)), host: ownerHost(owner) });
export const webviewHtml = (id: number, html: string) => {
  const p = panels.get(id);
  if (p) p.html = html;
};
export const webviewDispose = (id: number) => panels.delete(id);
/** Host berhenti/dimulai ulang: semua panelnya sudah mati (id dimulai dari 1 lagi di proses baru). */
export const webviewClear = () => panels.clear();

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm", ".map": "application/json", ".txt": "text/plain", ".md": "text/markdown", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm" };

/** Ekstrak nonce dari meta Content-Security-Policy (prioritas directive script-src) atau tag script. */
export function extractNonce(html: string): string | undefined {
  const metaRegex = /<meta\s+[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi;
  for (const m of html.matchAll(metaRegex)) {
    const tag = m[0];
    const content = (tag.match(/\bcontent="([^"]*)"/i) || tag.match(/\bcontent='([^']*)'/i) || tag.match(/\bcontent=([^\s>]+)/i) || [])[1] || tag;
    const scriptSrcMatch = content.match(/\bscript-src(?:-elem)?\s+([^;]+)/i);
    if (scriptSrcMatch) {
      const n = (scriptSrcMatch[1].match(/'nonce-([^']+)'/i) || scriptSrcMatch[1].match(/\bnonce-([A-Za-z0-9+/=_-]+)/i) || [])[1];
      if (n) return n;
    }
    const defaultSrcMatch = content.match(/\bdefault-src\s+([^;]+)/i);
    if (defaultSrcMatch) {
      const n = (defaultSrcMatch[1].match(/'nonce-([^']+)'/i) || defaultSrcMatch[1].match(/\bnonce-([A-Za-z0-9+/=_-]+)/i) || [])[1];
      if (n) return n;
    }
  }
  const scriptMatch = html.match(/<script\s+[^>]*\bnonce=["']([A-Za-z0-9+/=_-]+)["']/i);
  if (scriptMatch) return scriptMatch[1];
  const generalMatch = html.match(/'nonce-([A-Za-z0-9+/=_-]+)'/i);
  if (generalMatch) return generalMatch[1];
  return undefined;
}

/**
 * Siapkan HTML webview: pastikan script bootstrap acquireVsCodeApi disisipkan dan tidak diblokir CSP.
 * Jika meta CSP ketat tidak memiliki nonce atau 'unsafe-inline' (mis. Codex), nonce baru dibuat
 * dan disisipkan ke kebijakan script-src meta CSP.
 */
export function prepareWebviewHtml(id: number, html: string): string {
  let nonce = extractNonce(html);
  const metaRegex = /<meta\s+[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/i;

  if (!nonce && metaRegex.test(html)) {
    const metaTag = html.match(metaRegex)?.[0] || "";
    const content = (metaTag.match(/\bcontent="([^"]*)"/i) || metaTag.match(/\bcontent='([^']*)'/i) || [])[1] || metaTag;
    const scriptSrc = (content.match(/\bscript-src(?:-elem)?\s+([^;]+)/i) || [])[1] || (content.match(/\bdefault-src\s+([^;]+)/i) || [])[1] || "";
    const allowsUnsafeInline = /'unsafe-inline'/i.test(scriptSrc);

    if (!allowsUnsafeInline) {
      const gen = Math.random().toString(36).slice(2) + Date.now().toString(36);
      nonce = gen;
      let patched = false;
      html = html.replace(metaRegex, (tag) => {
        if (patched) return tag;
        if (/\bscript-src\b/i.test(tag)) {
          patched = true;
          return tag.replace(/(\bscript-src\s+)/i, `$1'nonce-${gen}' `);
        } else if (/\bdefault-src\b/i.test(tag)) {
          patched = true;
          return tag.replace(/(\bdefault-src\s+)/i, `$1'nonce-${gen}' `);
        } else {
          patched = true;
          return tag.replace(/(content=["'])/i, `$1script-src 'nonce-${gen}'; `);
        }
      });
    }
  }

  const boot = bootstrap(id, nonce);
  const headRe = /<head(?:\s[^>]*)?>/i; // bukan <header>
  if (headRe.test(html)) return html.replace(headRe, (m) => m + boot);
  // Tanpa <head>: sisipkan setelah doctype/<html> supaya halaman tidak jatuh ke quirks mode.
  const m = /^\s*(?:<!doctype[^>]*>\s*)?(?:<html(?:\s[^>]*)?>\s*)?/i.exec(html);
  const at = m ? m[0].length : 0;
  return html.slice(0, at) + boot + html.slice(at);
}

/** Skrip awal: API acquireVsCodeApi + penerapan tema dari aplikasi (variabel --vscode-*). */
export const bootstrap = (id: number, nonce?: string) =>
  `<script${nonce ? ` nonce="${nonce}"` : ""}>(function(){var id=${id};var state;var api={postMessage:function(m){parent.postMessage({__alexelWebview:id,type:"msg",message:m},"*")},getState:function(){return state},setState:function(s){state=s;parent.postMessage({__alexelWebview:id,type:"state",state:s},"*");return s}};window.acquireVsCodeApi=function(){return api};var send=function(l,a){try{parent.postMessage({__alexelWebview:id,type:"log",level:l,text:Array.prototype.map.call(a,function(x){try{return x instanceof Error?(x.stack||x.message):typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}};["error","warn"].forEach(function(l){var o=console[l];console[l]=function(){send(l,arguments);return o.apply(console,arguments)}});window.addEventListener("error",function(e){send("error",[e.message+" ("+(e.filename||"")+":"+e.lineno+")"])});window.addEventListener("unhandledrejection",function(e){send("error",["unhandledrejection: ",e.reason])});window.addEventListener("message",function(e){var d=e.data;if(d&&d.__alexelPost){e.stopImmediatePropagation();window.dispatchEvent(new MessageEvent("message",{data:d.message,origin:location.origin,source:window}));return}if(d&&d.__alexelTheme){var r=document.documentElement;for(var k in d.vars)r.style.setProperty(k,d.vars[k]);var kind=d.dark?"vscode-dark":"vscode-light";var apply=function(el){if(!el)return;el.classList.remove("vscode-dark","vscode-light");el.classList.add(kind);if(el===document.body){el.setAttribute("data-vscode-theme-kind",kind);el.setAttribute("data-vscode-theme-name",d.dark?"Dark Modern":"Light Modern");el.setAttribute("data-vscode-theme-id",d.dark?"Default Dark Modern":"Default Light Modern")}};apply(r);if(document.body)apply(document.body);else document.addEventListener("DOMContentLoaded",function(){apply(document.body)});e.stopImmediatePropagation()}},true)})();</script>`;

export interface WebResponse {
  status: number;
  body: string | Buffer;
  mime: string;
  csp?: boolean;
}

/** Selesaikan URL `nozelweb://v/<id>/…` (dokumen) atau `nozelweb://r/<id>/<path ter-encode>` (sumber daya). */
export function resolveWebview(url: string): WebResponse {
  const u = new URL(url);
  // nozelweb://w<hash>/v/<id>/index.html (dokumen) atau /r/<id>/<path> (sumber daya)
  const [kind, idStr, ...rest] = u.pathname.split("/").filter(Boolean);
  const id = Number(idStr);
  const panel = panels.get(id);
  if (!panel || u.host !== panel.host) return { status: 404, body: "Not found", mime: "text/plain" };
  const parts = [idStr, ...rest];
  if (kind === "v") {
    // Skrip awal harus jalan sebelum skrip halaman: taruh paling atas dokumen.
    const html = panel.html || "<!doctype html><html><body></body></html>";
    const injected = prepareWebviewHtml(id, html);
    return { status: 200, body: injected, mime: "text/html; charset=utf-8", csp: true };
  }
  if (kind === "r") {
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
