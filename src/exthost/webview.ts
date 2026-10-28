// Webview dari ekstensi: tab editor berisi iframe ber-sandbox (nozelweb://), pesan dua arah dengan host.

import { create } from "zustand";
import { getState, setState } from "../state/store";
import { hostNotify } from "./client";

export const WEBVIEW_PREFIX = "nozel:webview:";
/** Sama dengan ownerHost() di electron/exthost/webviews.ts: origin berbeda tiap ekstensi. */
export function ownerHost(owner: string | undefined): string {
  let h = 0x811c9dc5;
  for (const c of owner ?? "anon") h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return `w${h.toString(16).padStart(8, "0")}`;
}
export const webviewSrc = (id: number, owner: string | undefined) => `nozelweb://${ownerHost(owner)}/v/${id}/index.html`;
export const webviewTabId = (id: number) => `${WEBVIEW_PREFIX}${id}`;
export const webviewIdOf = (tabId: string): number | null => (tabId.startsWith(WEBVIEW_PREFIX) ? Number(tabId.slice(WEBVIEW_PREFIX.length)) : null);

export const useWebviews = create<{ panels: Record<number, { title: string; rev: number; viewType: string; owner?: string }>; views: Record<string, number> }>(() => ({ panels: {}, views: {} }));

const frames = new Map<number, HTMLIFrameElement>();
const loaded = new Set<number>();
const queue = new Map<number, unknown[]>();

/** Variabel tema gaya VS Code (--vscode-*) dari warna desain yang aktif. */
export function themeVars(): { vars: Record<string, string>; dark: boolean } {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d = "") => cs.getPropertyValue(n).trim() || d;
  const bg = v("--ed-bg", v("--bg", "#1e1e1e"));
  const fg = v("--ed-fg", v("--fg", "#d4d4d4"));
  const accent = v("--accent", "#0e639c");
  return {
    dark: document.documentElement.dataset.scheme !== "light",
    vars: {
      "--vscode-editor-background": bg,
      "--vscode-editor-foreground": fg,
      "--vscode-foreground": v("--fg", fg),
      "--vscode-descriptionForeground": v("--fg-muted", fg),
      "--vscode-sideBar-background": v("--sidebar-bg", bg),
      "--vscode-panel-border": v("--border", "#444"),
      "--vscode-focusBorder": accent,
      "--vscode-textLink-foreground": v("--accent-text", accent),
      "--vscode-button-background": accent,
      "--vscode-button-foreground": v("--accent-fg", "#fff"),
      "--vscode-button-hoverBackground": accent,
      "--vscode-input-background": v("--input-bg", bg),
      "--vscode-input-foreground": fg,
      "--vscode-input-border": v("--border", "#444"),
      "--vscode-errorForeground": v("--danger", "#f14c4c"),
      "--vscode-editor-font-family": v("--font-mono", "monospace"),
      "--vscode-font-family": v("--font-ui", "system-ui, sans-serif"),
      "--vscode-font-size": "13px",
      "--vscode-editor-font-size": "13px",
    },
  };
}

function sendTheme(id: number) {
  const f = frames.get(id);
  if (f?.contentWindow) f.contentWindow.postMessage({ __alexelTheme: true, ...themeVars() }, "*");
}

export function registerFrame(id: number, frame: HTMLIFrameElement | null) {
  if (!frame) {
    frames.delete(id);
    loaded.delete(id);
    return;
  }
  // `loaded` tidak direset di sini: load bisa terjadi sebelum efek ini jalan (dibersihkan saat frame lama dilepas).
  frames.set(id, frame);
}

/** Dipanggil dari `onLoad` iframe (terpasang saat elemen dibuat, jadi tidak ketinggalan peristiwa load). */
export function frameLoaded(id: number, frame: HTMLIFrameElement) {
  if (frames.get(id) !== frame) frames.set(id, frame);
  loaded.add(id);
  sendTheme(id);
  for (const m of queue.get(id) ?? []) frame.contentWindow?.postMessage({ __alexelPost: true, message: m }, "*");
  queue.delete(id);
}

const trace = (dir: string, id: number, m: unknown) => {
  if (!(window as unknown as { __webviewDebug?: boolean }).__webviewDebug) return;
  const x = m as { type?: string; request?: { type?: string }; message?: { type?: string; request?: { type?: string } } | unknown[] };
  const t = Array.isArray(x?.message) ? `${x.type}:${String(x.message[0])}` : `${x?.type}:${(x?.message as { type?: string; request?: { type?: string } } | undefined)?.type ?? ""}${x?.request?.type ?? (x?.message as { request?: { type?: string } } | undefined)?.request?.type ?? ""}`;
  void import("../app/output").then((o) => o.logOutput("Webview", `${dir} ${panels(id)} ${t}`));
};

export function postToWebview(id: number, message: unknown) {
  trace("->page", id, message);
  const f = frames.get(id);
  // Dibungkus: skrip awal di dalam iframe mengirim ulang sebagai event satu-origin, seperti di VS Code
  // (banyak halaman webview menolak pesan yang origin-nya bukan window.location.origin).
  if (f?.contentWindow && loaded.has(id)) f.contentWindow.postMessage({ __alexelPost: true, message }, "*");
  else queue.set(id, [...(queue.get(id) ?? []), message]);
}

const panels = (id: number) => useWebviews.getState().panels[id]?.viewType ?? String(id);

let listening = false;
export function listenWebviewMessages() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (e) => {
    const d = e.data as { __alexelWebview?: number; type?: string; message?: unknown } | null;
    if (!d || typeof d.__alexelWebview !== "number") return;
    const f = frames.get(d.__alexelWebview);
    if (!f || e.source !== f.contentWindow) return; // hanya dari iframe milik panel itu
    if (d.type === "msg") trace("<-page", d.__alexelWebview, d.message);
    if (d.type === "msg") hostNotify("webview/message", { id: d.__alexelWebview, message: d.message });
    // Galat/peringatan dari dalam webview dicatat di Output → Webview (membantu melacak ekstensi yang tak tampil).
    else if (d.type === "log") {
      const m = d as unknown as { level: string; text: string };
      void import("../app/output").then((o) => o.logOutput("Webview", `[${panels(d.__alexelWebview as number)}] ${m.level}: ${String(m.text).slice(0, 2000)}`));
    }
  });
}

/** Webview untuk tampilan sidebar (tanpa tab): hanya dicatat; iframe-nya dirender panel Tampilan ekstensi. */
export function registerViewWebview(id: number, viewId: string, title: string, viewType: string, owner?: string) {
  useWebviews.setState((s) => ({ panels: { ...s.panels, [id]: { title, rev: 0, viewType, owner } }, views: { ...s.views, [viewId]: id } }));
}

export function openWebviewTab(id: number, title: string, viewType: string, owner: string | undefined, column: number) {
  useWebviews.setState((s) => ({ panels: { ...s.panels, [id]: { title, rev: 0, viewType, owner } } }));
  const tid = webviewTabId(id);
  setState((s) => ({ tabs: { ...s.tabs, [tid]: { id: tid, name: title, kind: "webview", dirty: false, lang: "", preview: "code" } } }));
  void import("../app/actions").then((A) => A.showTab(tid, column === -2 || column === 2 ? 1 : getState().focusedGroup));
}

export function closeWebviewTab(id: number) {
  const tid = webviewTabId(id);
  useWebviews.setState((s) => {
    const panels = { ...s.panels };
    delete panels[id];
    const views = Object.fromEntries(Object.entries(s.views).filter(([, v]) => v !== id));
    return { panels, views };
  });
  frames.delete(id);
  loaded.delete(id);
  queue.delete(id);
  void import("../app/actions").then((A) => A.closeTabEverywhere(tid));
}

/** Iframe panel ini sudah selesai dimuat (dipakai uji). */
export const webviewLoaded = (id: number) => loaded.has(id);
