// Tab browser di renderer: id view di main, alamat/judul/status per tab, buka & tutup.

import { create } from "zustand";
import { showTab } from "../app/actions";
import { logOutput } from "../app/output";
import { api, errMsg, on } from "../lib/ipc";
import { getState as appState, setState as appSet, useStore } from "../state/store";
import { tl } from "../i18n";

export interface BrowserInfo {
  view: number | null;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  favicon: string | null;
  error: string | null;
  device: string;
}

export const useBrowser = create<{ tabs: Record<string, BrowserInfo> }>(() => ({ tabs: {} }));
const set = useBrowser.setState;

export const PREFIX = "nozel:browser:";
const byView = (view: number) => Object.entries(useBrowser.getState().tabs).find(([, b]) => b.view === view)?.[0];

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  void on<{ id: number; tag?: string; type: string; url?: string; title?: string; loading?: boolean; canGoBack?: boolean; canGoForward?: boolean; favicon?: string | null; error?: string; level?: string; message?: string; source?: string; line?: number }>("browser-event", (e) => {
    const tab = e.tag && useBrowser.getState().tabs[e.tag] ? e.tag : byView(e.id);
    if (e.type === "open" && e.url) return void openBrowser(e.url);
    if (!tab) return;
    if (e.type === "console") return logOutput(tl("Browser"), `[${e.level}] ${e.message}${e.source ? ` (${e.source}:${e.line ?? 0})` : ""}`);
    set((s) => {
      const cur = s.tabs[tab];
      if (!cur) return s;
      const next: BrowserInfo = {
        ...cur,
        url: e.url ?? cur.url,
        title: e.title || cur.title,
        loading: e.loading ?? cur.loading,
        canGoBack: e.canGoBack ?? cur.canGoBack,
        canGoForward: e.canGoForward ?? cur.canGoForward,
        favicon: e.type === "favicon" ? e.favicon ?? null : e.type === "nav" && e.url !== cur.url ? null : cur.favicon,
        error: e.type === "error" ? e.error ?? null : e.type === "loading" || e.type === "nav" ? null : cur.error,
      };
      return { tabs: { ...s.tabs, [tab]: next } };
    });
    if (e.type === "title" || e.type === "nav") {
      const t = appState().tabs[tab];
      const name = (e.title || e.url || "").slice(0, 40) || tl("Browser");
      if (t && t.name !== name) appSet((s) => ({ tabs: { ...s.tabs, [tab]: { ...t, name } } }));
    }
  });
  // Tab ditutup → view di main dihancurkan.
  useStore.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    for (const [id, b] of Object.entries(useBrowser.getState().tabs)) {
      if (!s.tabs[id]) {
        if (b.view !== null) void api.browserDestroy(b.view).catch(() => {});
        set((st) => {
          const tabs = { ...st.tabs };
          delete tabs[id];
          return { tabs };
        });
      }
    }
  });
}

let seq = 0;
export function openBrowser(url = "", group?: number) {
  wire();
  const id = `${PREFIX}${Date.now().toString(36)}${seq++}`;
  set((s) => ({ tabs: { ...s.tabs, [id]: { view: null, url, title: "", loading: !!url, canGoBack: false, canGoForward: false, favicon: null, error: null, device: "responsive" } } }));
  appSet((s) => ({ tabs: { ...s.tabs, [id]: { id, name: url ? url.replace(/^https?:\/\//, "").slice(0, 40) : tl("Browser"), kind: "browser", dirty: false, lang: "", preview: "code" } } }));
  showTab(id, group);
}

const creating = new Map<string, Promise<number | null>>();
/** View untuk tab ini (dibuat sekali; panggilan bersamaan berbagi janji yang sama). */
export function ensureView(tabId: string): Promise<number | null> {
  wire();
  const b = useBrowser.getState().tabs[tabId];
  if (!b) return Promise.resolve(null);
  if (b.view !== null) return Promise.resolve(b.view);
  let p = creating.get(tabId);
  if (!p) {
    p = api.browserCreate(b.url || "about:blank", tabId).then((view) => {
      creating.delete(tabId);
      if (!useBrowser.getState().tabs[tabId]) {
        void api.browserDestroy(view).catch(() => {});
        return null;
      }
      set((s) => ({ tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], view } } }));
      return view;
    }, (e: unknown) => {
      // Gagal membuat view: jangan simpan janji yang ditolak (tab bisa dicoba lagi), tampilkan error di tab.
      creating.delete(tabId);
      set((s) => (s.tabs[tabId] ? { tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], loading: false, error: errMsg(e) } } } : s));
      return null;
    });
    creating.set(tabId, p);
  }
  return p;
}
