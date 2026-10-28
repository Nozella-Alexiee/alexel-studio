// Alexel Studio — main process Electron.
// Keamanan: contextIsolation + sandbox, tanpa nodeIntegration, CSP ketat, navigasi & popup diblok,
// semua command lewat satu pintu IPC dengan whitelist (lihat commands.ts).

import { stopIde } from "./ide";
import { resolveWebview } from "./exthost/webviews";
import { stopExtHost } from "./exthost/manager";
import { runScheduledUpdate } from "./updater";
import { cleanTempBins } from "./runner";
import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell, type MenuItemConstructorOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { killAllAgents } from "./agents";
import { killAllDap } from "./dap";
import { killAllLsp } from "./lsp";
import { buildCommands } from "./commands";
import { pruneUndo } from "./fsOps";
import { extAsset } from "./extensions";
import { resolvePreview } from "./preview";
import { killAllPtys } from "./pty";
import { migrateOldData } from "./store";
import { warmPath, type Ctx } from "./util";
import { unwatch } from "./watcher";

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const APP_ORIGIN = "app://nozel";
const RENDERER_DIR = path.join(__dirname, "..", "dist");

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: nozelpreview: nozelext: https://open-vsx.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src nozelpreview: nozelweb:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

// Folder data terpisah (dipakai uji otomatis supaya tidak menyentuh data asli).
// Hook uji otomatis hanya untuk build pengembangan; aplikasi terpaket mengabaikannya.
const TEST = !app.isPackaged;
const SMOKE = TEST ? process.env.NOZEL_SMOKE : undefined;
if (TEST && process.env.NOZEL_USER_DATA) app.setPath("userData", process.env.NOZEL_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  { scheme: "nozelpreview", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: "nozelext", privileges: { standard: true, secure: true } },
  { scheme: "nozelweb", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let allowClose = false;
let quitting = false;
const pendingOpen: string[] = [];

/**
 * Windows: semua path yang dikirim ke renderer memakai satu bentuk ("C:/Users/x/a.ts") supaya
 * perbandingan path di UI sederhana. Isi berkas & output perintah tidak pernah diubah.
 */
const CONTENT_KEYS = new Set(["content", "text", "line", "data", "diff", "stdout", "stderr", "message", "result", "body", "command", "before", "after", "error"]);
const CONTENT_CMDS = new Set(["read_file_text", "history_read", "ext_read_file", "git_head", "git_diff_file", "claude_inline", "agent_session_load", "checkpoint_pre", "agent_once", "git_commit_context", "git_show_commit", "git_blame", "read_file_head"]);
function toUiPaths(v: unknown, key = ""): unknown {
  if (process.platform !== "win32" || CONTENT_KEYS.has(key)) return v;
  if (typeof v === "string") return /^([A-Za-z]:\\|\\\\)/.test(v) && !/[\r\n]/.test(v) ? v.replace(/\\/g, "/").replace(/^[a-z]:/, (d) => d.toUpperCase()) : v;
  if (Array.isArray(v)) return v.map((x) => toUiPaths(x));
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = toUiPaths(x, k);
    return out;
  }
  return v;
}

setTimeout(() => cleanTempBins(), 5000); // sisa biner Run sebelumnya

const ctx: Ctx = {
  userData: app.getPath("userData"),
  emit: (event, payload) => {
    if (win && !win.isDestroyed()) win.webContents.send("nozel:event", event, event === "pty-data" || event === "agent-event" || event === "ide-request" || event === "ide-cancel" || event === "exthost-request" || event === "exthost-event" || event === "lsp-message" || event === "dap-message" ? payload : toUiPaths(payload));
  },
  // Path dari UI memakai "/" juga di Windows; API shell Windows butuh "\\".
  trash: (p) => shell.trashItem(path.normalize(p)),
  reveal: (p) => shell.showItemInFolder(path.normalize(p)),
};

const commands = buildCommands(ctx, {
  confirmClose: (w) => {
    allowClose = true;
    w.close();
  },
  setMenu: (spec) => setAppMenu(Array.isArray(spec) ? (spec as MenuSpec[]) : null),
});

// Mode uji otomatis saja: skrip uji boleh minta screenshot berkali-kali ke folder NOZEL_SMOKE_SHOTS.
if (SMOKE && process.env.NOZEL_SMOKE_SHOTS) {
  const dir = process.env.NOZEL_SMOKE_SHOTS;
  commands.smoke_shot = async (a, w) => {
    const name = String(a.name ?? "shot").replace(/[^\w.-]/g, "_");
    if (!w) return null;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.png`), (await w.webContents.capturePage()).toPNG());
    return name;
  };
  // Input asli (mouse/keyboard) seperti pengguna, bukan event DOM sintetis.
  commands.smoke_input = async (a, w) => {
    if (!w) return null;
    const wc = w.webContents;
    const mods = (a.modifiers as ("cmd" | "shift" | "alt" | "control")[] | undefined)?.map((m) => (m === "cmd" ? "meta" : m)) as Electron.InputEvent["modifiers"];
    if (a.type === "click") {
      const x = Number(a.x), y = Number(a.y);
      wc.sendInputEvent({ type: "mouseMove", x, y });
      wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
    } else if (a.type === "drag") {
      const [x1, y1, x2, y2] = [Number(a.x), Number(a.y), Number(a.x2), Number(a.y2)];
      wc.sendInputEvent({ type: "mouseMove", x: x1, y: y1 });
      wc.sendInputEvent({ type: "mouseDown", x: x1, y: y1, button: "left", clickCount: 1 });
      for (let i = 1; i <= 12; i++) {
        await new Promise((r) => setTimeout(r, 25));
        wc.sendInputEvent({ type: "mouseMove", x: Math.round(x1 + ((x2 - x1) * i) / 12), y: Math.round(y1 + ((y2 - y1) * i) / 12), button: "left" } as Electron.MouseInputEvent);
      }
      await new Promise((r) => setTimeout(r, 120));
      wc.sendInputEvent({ type: "mouseUp", x: x2, y: y2, button: "left", clickCount: 1 });
    } else if (a.type === "key") {
      const keyCode = String(a.key);
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers: mods });
      if (keyCode.length === 1 && !mods?.some((m) => m === "meta" || m === "control")) wc.sendInputEvent({ type: "char", keyCode, modifiers: mods });
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers: mods });
    } else if (a.type === "text") {
      for (const ch of String(a.text)) {
        wc.sendInputEvent({ type: "keyDown", keyCode: ch });
        wc.sendInputEvent({ type: "char", keyCode: ch });
        wc.sendInputEvent({ type: "keyUp", keyCode: ch });
      }
    }
    return true;
  };
}

function isTrustedSender(url: string) {
  return url.startsWith(APP_ORIGIN + "/") || (!!DEV_URL && url.startsWith(DEV_URL));
}

ipcMain.handle("nozel:invoke", async (e, cmd: string, args: Record<string, unknown>) => {
  if (!e.senderFrame || !isTrustedSender(e.senderFrame.url)) return { ok: false, error: "Pengirim tidak dipercaya." };
  const h = commands[cmd];
  if (!h) return { ok: false, error: `Command tidak dikenal: ${cmd}` };
  try {
    const value = await h(args ?? {}, BrowserWindow.fromWebContents(e.sender));
    return { ok: true, value: value === undefined ? null : CONTENT_CMDS.has(cmd) ? value : toUiPaths(value) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

function serveApp() {
  protocol.handle("app", async (req) => {
    const { pathname } = new URL(req.url);
    let file = path.normalize(path.join(RENDERER_DIR, decodeURIComponent(pathname)));
    if (file !== RENDERER_DIR && !file.startsWith(RENDERER_DIR + path.sep)) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(RENDERER_DIR, "index.html");
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith(".html")) headers.set("Content-Security-Policy", CSP);
    return new Response(res.body, { status: res.status, headers });
  });
  // Ikon dari tema ikon ekstensi (gambar statis saja; dipakai lewat <img>, jadi SVG tidak bisa menjalankan skrip).
  protocol.handle("nozelext", (req) => {
    const u = new URL(req.url);
    if (u.host !== "icons") return new Response("Forbidden", { status: 403 });
    const r = extAsset(ctx, u.pathname);
    return new Response(typeof r.body === "string" ? r.body : new Uint8Array(r.body), {
      status: r.status,
      headers: { "Content-Type": r.mime, "Cache-Control": "max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  });
  // Webview ekstensi (iframe ber-sandbox); lihat exthost/webviews.ts.
  protocol.handle("nozelweb", (req) => {
    const r = resolveWebview(req.url);
    if (process.env.NOZEL_WEB_DEBUG) console.log("nozelweb", r.status, req.url.slice(0, 200).replace(/\/private\/tmp[^ ]*\/ext\//, "<ext>/"));
    return new Response(typeof r.body === "string" ? r.body : new Uint8Array(r.body), {
      status: r.status,
      headers: {
        "Content-Type": r.mime,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        ...(r.csp ? { "Content-Security-Policy": "default-src * nozelweb: data: blob: 'unsafe-inline' 'unsafe-eval'" } : {}),
      },
    });
  });
  protocol.handle("nozelpreview", (req) => {
    const r = resolvePreview(new URL(req.url).pathname);
    return new Response(typeof r.body === "string" ? r.body : new Uint8Array(r.body), {
      status: r.status,
      headers: {
        "Content-Type": r.mime,
        "Cache-Control": "no-store",
        // Iframe pratinjau ber-sandbox (origin "null"); script type=module & crossorigin butuh izin CORS.
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
      },
    });
  });
}

/** Item menu dari renderer (src/app/menus.ts). id = perintah renderer; role = aksi bawaan Electron. */
interface MenuSpec {
  label?: string;
  id?: string;
  role?: string;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  type?: "separator" | "checkbox";
  submenu?: MenuSpec[];
}

const ROLES = new Set(["undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll", "togglefullscreen", "minimize", "zoom", "front", "about", "hide", "hideOthers", "unhide", "quit", "toggleDevTools", "close"]);

function toTemplate(items: MenuSpec[], depth = 0): MenuItemConstructorOptions[] {
  return items.slice(0, 80).map((it): MenuItemConstructorOptions => {
    if (it.type === "separator") return { type: "separator" };
    if (it.role && ROLES.has(it.role)) return { role: it.role as MenuItemConstructorOptions["role"], ...(it.label ? { label: String(it.label) } : {}) };
    const out: MenuItemConstructorOptions = { label: String(it.label ?? "") };
    if (Array.isArray(it.submenu) && depth < 2) out.submenu = toTemplate(it.submenu, depth + 1);
    else if (typeof it.id === "string") {
      const id = it.id;
      out.click = () => ctx.emit("menu-command", { id });
      if (typeof it.accelerator === "string" && it.accelerator.length < 40) {
        out.accelerator = it.accelerator;
        // Shortcut hanya ditampilkan; tombolnya ditangani renderer supaya perilakunya sama di semua OS.
        out.registerAccelerator = false;
      }
      if (it.enabled === false) out.enabled = false;
      if (it.type === "checkbox") {
        out.type = "checkbox";
        out.checked = !!it.checked;
      }
    }
    return out;
  });
}

/** macOS: menu aplikasi native dari definisi renderer. Windows/Linux memakai menu bar di dalam jendela. */
function setAppMenu(spec: MenuSpec[] | null) {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const fallback: MenuItemConstructorOptions[] = [
    { label: "Alexel Studio", submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "Jendela", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] },
  ];
  const template = spec ? toTemplate(spec) : fallback;
  if (DEV_URL && spec) template.push({ label: "Developer", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildMenu() {
  setAppMenu(null);
}

function createWindow() {
  allowClose = false;
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: "Alexel Studio",
    backgroundColor: "#0e1016",
    // Semua OS memakai title bar Nozel sendiri. macOS: lampu lalu lintas; Windows/Linux:
    // tombol jendela OS ditumpangkan (overlay) di kanan title bar, warnanya mengikuti desain.
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    ...(process.platform !== "darwin" ? { titleBarOverlay: { color: "#0b1220", symbolColor: "#d6e2f5", height: 44 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      // Penampil PDF bawaan Chromium untuk tab PDF (iframe ke nozelpreview://, hanya berkas .pdf).
      plugins: true,
    },
  });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!isTrustedSender(url)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });
  // Menu klik kanan bawaan untuk kolom teks, terminal, dan teks terseleksi. Editor & Explorer
  // memakai menu sendiri dari renderer (yang memanggil preventDefault, jadi event ini tidak muncul).
  wc.on("context-menu", (_e, p) => {
    const items: MenuItemConstructorOptions[] = [];
    if (p.isEditable) {
      items.push({ role: "undo", enabled: p.editFlags.canUndo }, { role: "redo", enabled: p.editFlags.canRedo }, { type: "separator" });
      items.push({ role: "cut", enabled: p.editFlags.canCut }, { role: "copy", enabled: p.editFlags.canCopy }, { role: "paste", enabled: p.editFlags.canPaste }, { type: "separator" }, { role: "selectAll" });
    } else if (p.selectionText.trim()) {
      items.push({ role: "copy" });
    }
    if (p.linkURL && /^https?:/i.test(p.linkURL)) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "Open Link in Browser", click: () => void shell.openExternal(p.linkURL) });
    }
    if (items.length && win) Menu.buildFromTemplate(items).popup({ window: win });
  });
  wc.on("render-process-gone", () => {
    allowClose = true;
  });
  win.once("ready-to-show", () => win?.show());
  win.on("close", (e) => {
    if (allowClose) return;
    // Renderer yang memutuskan: tanya simpan berkas & hentikan proses dulu.
    e.preventDefault();
    ctx.emit("window-close-requested", {});
  });
  win.on("closed", () => {
    win = null;
    // macOS: app tetap hidup tanpa jendela, tapi proses milik jendela (agen, terminal, debugger,
    // server bahasa) harus berhenti; agen tanpa UI bisa terus mengubah berkas.
    stopWindowProcesses();
    if (quitting || process.platform !== "darwin") app.quit();
  });
  void pruneUndo(ctx);
  wc.once("did-finish-load", () => {
    for (const p of pendingOpen.splice(0)) ctx.emit("open-path", { path: p });
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadURL(`${APP_ORIGIN}/index.html`);
  if (SMOKE) runSmoke(win, SMOKE);
}

/** Uji otomatis (hanya bila env NOZEL_SMOKE berisi path skrip): jalankan skrip di renderer,
 *  cetak hasilnya, simpan screenshot, lalu keluar. Tidak aktif dalam pemakaian normal. */
function runSmoke(w: BrowserWindow, scriptPath: string) {
  w.webContents.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning" || process.env.NOZEL_SMOKE_LOGS === "all") process.stdout.write(`SMOKE_CONSOLE ${e.level} ${e.message.slice(0, 400)}\n`);
  });
  w.webContents.once("did-finish-load", async () => {
    try {
      const code = fs.readFileSync(scriptPath, "utf8");
      const result = await w.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
      process.stdout.write(`SMOKE_RESULT ${JSON.stringify(result)}\n`);
      const shots = process.env.NOZEL_SMOKE_SHOT;
      if (shots) fs.writeFileSync(shots, (await w.webContents.capturePage()).toPNG());
    } catch (e) {
      process.stdout.write(`SMOKE_ERROR ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    }
    allowClose = true;
    app.exit(0);
  });
}

app.on("open-file", (e, p) => {
  e.preventDefault();
  if (win && !win.webContents.isLoading()) ctx.emit("open-path", { path: p });
  else pendingOpen.push(p);
});

app.on("second-instance", (_e, argv, workingDirectory) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    // Path relatif (mis. `alexel .`) dihitung dari folder terminal pemanggil, bukan folder instance pertama.
    const p = argv.slice(1).filter((a) => !a.startsWith("-")).map((a) => path.resolve(workingDirectory || process.cwd(), a)).find((a) => fs.existsSync(a));
    if (p) ctx.emit("open-path", { path: p });
  }
});

app.on("quit", () => runScheduledUpdate());

app.on("before-quit", () => {
  quitting = true;
});

function stopWindowProcesses() {
  killAllPtys();
  killAllAgents();
  killAllDap();
  killAllLsp();
  stopExtHost();
  stopIde();
  void unwatch();
}

app.on("will-quit", stopWindowProcesses);

app.on("activate", () => {
  if (!win) createWindow();
});

app.whenReady().then(() => {
  warmPath();
  if (!(TEST && process.env.NOZEL_USER_DATA)) migrateOldData(ctx, app.getPath("appData"));
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write"));
  serveApp();
  buildMenu();
  const cliPath = process.argv.slice(DEV_URL ? 2 : 1).find((a) => !a.startsWith("-") && fs.existsSync(a));
  if (cliPath) pendingOpen.push(path.resolve(cliPath));
  createWindow();
});
