// Tab Browser terpadu: WebContentsView di dalam jendela utama, ditempel ke area tab (bounds dari
// renderer). Sesi terpisah `persist:browser` (cookie/login tidak bercampur dengan aplikasi), tanpa
// preload/Node, sandbox aktif, izin perangkat ditolak, dan pop-up dibuka sebagai tab baru.

import { BrowserWindow, dialog, ipcMain, session, WebContentsView, type Session } from "electron";
import path from "node:path";
import type { Ctx } from "./util";

interface Entry {
  view: WebContentsView;
  win: BrowserWindow;
  visible: boolean;
  /** Dialog alert/confirm yang sedang terbuka untuk tab ini; ditutup (= dibatalkan) saat tab ditutup. */
  dialogs: Set<AbortController>;
}

const views = new Map<number, Entry>();

interface DialogEvent {
  sender: { id: number; getURL(): string };
  returnValue: unknown;
}

// alert/confirm/prompt dari halaman (lihat browserPreload.ts) → dialog native yang memblokir halaman
// itu saja, seperti di browser biasa. prompt() tidak punya padanan native: dianggap dibatalkan.
// Halaman memanggil ipcRenderer.sendSync, jadi proses halaman itu menunggu sampai `returnValue` diisi;
// main TIDAK menunggu: dialognya asinkron (showMessageBox) dan `returnValue` diisi saat dialog ditutup.
// Selama dialog terbuka, pty, agen, dan IPC lain tetap berjalan.
export async function answerDialog(e: DialogEvent, kind: string, message: string): Promise<void> {
  const reply = (v: unknown) => {
    try {
      e.returnValue = v;
    } catch {
      /* halaman sudah ditutup */
    }
  };
  const owner = [...views.values()].find((x) => !x.view.webContents.isDestroyed() && x.view.webContents.id === e.sender.id);
  if (!owner) return reply(null);
  let host = "";
  try {
    host = new URL(e.sender.getURL()).host;
  } catch {
    /* about:blank */
  }
  // Uji otomatis: tanpa dialog (tidak ada yang bisa mengklik), confirm dianggap OK.
  if (process.env.NOZEL_SMOKE) {
    console.log(`SMOKE_DIALOG ${kind}: ${message}`);
    return reply(kind === "confirm" ? true : null);
  }
  const text = String(message ?? "").slice(0, 4000);
  const ac = new AbortController();
  owner.dialogs.add(ac);
  const opts = { title: host || "Browser", message: host ? `${host}` : "Browser", detail: text, signal: ac.signal };
  try {
    if (kind === "confirm") {
      const r = await dialog.showMessageBox(owner.win, { ...opts, type: "question", buttons: ["OK", "Batal"], defaultId: 0, cancelId: 1 });
      reply(!ac.signal.aborted && r.response === 0);
    } else {
      await dialog.showMessageBox(owner.win, { ...opts, type: "info", buttons: ["OK"], ...(kind === "alert" ? {} : { detail: `${text}\n\n(prompt() tidak didukung di tab browser; dianggap dibatalkan.)` }) });
      reply(null);
    }
  } catch {
    reply(kind === "confirm" ? false : null);
  } finally {
    owner.dialogs.delete(ac);
  }
}

let dialogsWired = false;
function wireDialogs() {
  if (dialogsWired) return;
  dialogsWired = true;
  ipcMain.on("alexel-browser:dialog", (e, kind: string, message: string) => void answerDialog(e, kind, message));
}
let seq = 0;
let configured: Session | null = null;

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function browserSession(): Session {
  const s = session.fromPartition("persist:browser");
  if (configured === s) return s;
  configured = s;
  // Kamera, mikrofon, lokasi, notifikasi, dsb. ditolak: halaman uji tidak butuh akses perangkat.
  s.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write" || permission === "fullscreen"));
  s.setPermissionCheckHandler((_wc, permission) => permission === "clipboard-sanitized-write" || permission === "fullscreen");
  return s;
}

export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "about:blank";
  if (/^about:blank$/i.test(s)) return "about:blank";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(s)) return `${/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(s) ? "http" : "https"}://${s}`;
  if (/^:\d+/.test(s)) return `http://localhost${s}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
}

const allowed = (url: string) => /^(https?:|about:blank)/i.test(url);

/** `tag` = id tab di renderer; ikut di setiap event supaya event awal tidak hilang sebelum id view diketahui. */
export function createBrowser(ctx: Ctx, win: BrowserWindow, url: string, tag: string): number {
  const id = ++seq;
  wireDialogs();
  const view = new WebContentsView({ webPreferences: { session: browserSession(), preload: path.join(__dirname, "browserPreload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, spellcheck: false } });
  view.setBackgroundColor("#ffffff");
  view.setVisible(false);
  win.contentView.addChildView(view);
  views.set(id, { view, win, visible: false, dialogs: new Set() });
  const wc = view.webContents;
  const state = (type: string, extra: Record<string, unknown> = {}) =>
    ctx.emit("browser-event", { id, tag, type, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward(), ...extra });
  wc.on("did-start-loading", () => state("loading"));
  wc.on("did-stop-loading", () => state("loaded"));
  wc.on("did-navigate", () => state("nav"));
  wc.on("did-navigate-in-page", () => state("nav"));
  wc.on("page-title-updated", () => state("title"));
  wc.on("page-favicon-updated", (_e, icons) => state("favicon", { favicon: icons[0] ?? null }));
  wc.on("did-fail-load", (_e, code, desc, url, isMain) => isMain && code !== -3 && state("error", { error: `${desc} (${code})`, failedUrl: url }));
  wc.on("console-message", (e) => {
    const lvl = (e as unknown as { level: string }).level;
    if (lvl === "error" || lvl === "warning") ctx.emit("browser-event", { id, tag, type: "console", level: lvl, message: (e as unknown as { message: string }).message, source: (e as unknown as { sourceId?: string }).sourceId, line: (e as unknown as { lineNumber?: number }).lineNumber });
  });
  wc.on("will-navigate", (e, u) => {
    if (!allowed(u)) e.preventDefault();
  });
  wc.setWindowOpenHandler(({ url: u }) => {
    if (allowed(u)) ctx.emit("browser-event", { id, tag, type: "open", url: u });
    return { action: "deny" };
  });
  wc.on("render-process-gone", (_e, d) => state("error", { error: `Proses halaman berhenti (${d.reason}).` }));
  void wc.loadURL(normalizeUrl(url)).catch(() => {});
  return id;
}

function entry(id: number): Entry {
  const e = views.get(id);
  if (!e || e.view.webContents.isDestroyed()) throw new Error("Tab browser sudah ditutup.");
  return e;
}

/** Bounds dalam piksel CSS renderer; dikali zoom jendela supaya pas saat aplikasi di-zoom. */
export function setBounds(id: number, b: { x: number; y: number; width: number; height: number; visible: boolean }) {
  const e = views.get(id);
  if (!e || e.view.webContents.isDestroyed()) return;
  const z = e.win.webContents.getZoomFactor();
  const r = { x: Math.round(b.x * z), y: Math.round(b.y * z), width: Math.max(0, Math.round(b.width * z)), height: Math.max(0, Math.round(b.height * z)) };
  e.view.setBounds(r);
  const vis = b.visible && r.width > 1 && r.height > 1;
  if (vis !== e.visible) {
    e.visible = vis;
    e.view.setVisible(vis);
  }
}

export function navigate(id: number, url: string) {
  const u = normalizeUrl(url);
  if (!allowed(u)) throw new Error("Hanya alamat http(s).");
  void entry(id).view.webContents.loadURL(u).catch(() => {});
  return u;
}

export function control(id: number, action: "back" | "forward" | "reload" | "hardReload" | "stop" | "devtools" | "zoomIn" | "zoomOut" | "zoomReset") {
  const wc = entry(id).view.webContents;
  if (action === "back") wc.navigationHistory.goBack();
  else if (action === "forward") wc.navigationHistory.goForward();
  else if (action === "reload") wc.reload();
  else if (action === "hardReload") wc.reloadIgnoringCache();
  else if (action === "stop") wc.stop();
  else if (action === "devtools") {
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: "detach" });
  } else if (action === "zoomIn") wc.setZoomLevel(Math.min(4, wc.getZoomLevel() + 0.5));
  else if (action === "zoomOut") wc.setZoomLevel(Math.max(-4, wc.getZoomLevel() - 0.5));
  else if (action === "zoomReset") wc.setZoomLevel(0);
}

/** Emulasi perangkat: lebar/tinggi viewport + user agent mobile; null = kembali normal. */
export function emulate(id: number, device: { width: number; height: number; mobile: boolean; scale?: number } | null) {
  const wc = entry(id).view.webContents;
  if (!device) {
    wc.disableDeviceEmulation();
    wc.setUserAgent(session.fromPartition("persist:browser").getUserAgent());
  } else {
    wc.enableDeviceEmulation({ screenPosition: device.mobile ? "mobile" : "desktop", screenSize: { width: device.width, height: device.height }, viewSize: { width: device.width, height: device.height }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: device.scale ?? 0, scale: 1 });
    wc.setUserAgent(device.mobile ? MOBILE_UA : session.fromPartition("persist:browser").getUserAgent());
  }
  wc.reload();
}

export async function screenshot(id: number): Promise<string> {
  const img = await entry(id).view.webContents.capturePage();
  return img.toPNG().toString("base64");
}

export function destroyBrowser(id: number) {
  const e = views.get(id);
  views.delete(id);
  if (!e) return;
  for (const ac of e.dialogs) ac.abort();
  e.dialogs.clear();
  try {
    e.win.contentView.removeChildView(e.view);
  } catch {
    /* jendela sudah ditutup */
  }
  if (!e.view.webContents.isDestroyed()) e.view.webContents.close();
}

export function destroyAll() {
  for (const id of [...views.keys()]) destroyBrowser(id);
}

export async function clearBrowserData() {
  await browserSession().clearStorageData();
  await browserSession().clearCache();
}

export const _test = { views };
