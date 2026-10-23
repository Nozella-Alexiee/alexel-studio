// Webview dari ekstensi: tab editor berisi iframe ber-sandbox (nozelweb://), pesan dua arah dengan host.

import { create } from "zustand";
import { getState, setState } from "../state/store";
import { hostNotify } from "./client";

export const WEBVIEW_PREFIX = "nozel:webview:";
export const webviewTabId = (id: number) => `${WEBVIEW_PREFIX}${id}`;
export const webviewIdOf = (tabId: string): number | null => (tabId.startsWith(WEBVIEW_PREFIX) ? Number(tabId.slice(WEBVIEW_PREFIX.length)) : null);

export const useWebviews = create<{ panels: Record<number, { title: string; rev: number; viewType: string; owner?: string }> }>(() => ({ panels: {} }));

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
  frames.set(id, frame);
  loaded.delete(id);
  frame.addEventListener("load", () => {
    loaded.add(id);
    sendTheme(id);
    for (const m of queue.get(id) ?? []) frame.contentWindow?.postMessage(m, "*");
    queue.delete(id);
  });
}

export function postToWebview(id: number, message: unknown) {
  const f = frames.get(id);
  if (f?.contentWindow && loaded.has(id)) f.contentWindow.postMessage(message, "*");
  else queue.set(id, [...(queue.get(id) ?? []), message]);
}

let listening = false;
export function listenWebviewMessages() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (e) => {
    const d = e.data as { __alexelWebview?: number; type?: string; message?: unknown } | null;
    if (!d || typeof d.__alexelWebview !== "number") return;
    const f = frames.get(d.__alexelWebview);
    if (!f || e.source !== f.contentWindow) return; // hanya dari iframe milik panel itu
    if (d.type === "msg") hostNotify("webview/message", { id: d.__alexelWebview, message: d.message });
  });
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
    return { panels };
  });
  frames.delete(id);
  loaded.delete(id);
  queue.delete(id);
  void import("../app/actions").then((A) => A.closeTabEverywhere(tid));
}

/** Iframe panel ini sudah selesai dimuat (dipakai uji). */
export const webviewLoaded = (id: number) => loaded.has(id);
