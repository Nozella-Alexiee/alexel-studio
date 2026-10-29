// Sisi renderer extension host: memulai/menghentikan host, memanggil host, dan menerima
// permintaan & peristiwa UI dari host (lihat handlers.ts).

import { call, isNative, on } from "../lib/ipc";
import { getState, useStore } from "../state/store";
import { clearHostUi, handleEvent, handleRequest } from "./handlers";
import { resetExtHost, useExtHost } from "./state";
import { startSync, stopSync } from "./sync";

let wired = false;
let restartTimer: number | null = null;
let restarts = 0;

export const hostRunning = () => useExtHost.getState().running;

/** Pengaturan Alexel Studio yang terlihat ekstensi sebagai pengaturan inti VS Code. */
function coreSettings(): Record<string, unknown> {
  const s = getState().settings;
  return {
    "editor.tabSize": s.tabSize,
    "editor.fontSize": s.fontSize,
    "editor.wordWrap": s.wordWrap ? "on" : "off",
    "editor.formatOnSave": s.formatOnSave,
    "editor.minimap.enabled": s.minimap,
    "files.autoSave": s.autoSave === "delay" ? "afterDelay" : "off",
    "workbench.colorThemeKind": document.documentElement.dataset.scheme === "light" ? 1 : 2,
    // Nama tema bawaan VS Code yang setara (berkasnya disediakan host: themeDefaults.ts).
    "workbench.colorTheme": document.documentElement.dataset.scheme === "light" ? "Default Light Modern" : "Default Dark Modern",
  };
}

export async function hostCall<T = unknown>(m: string, p?: unknown): Promise<T> {
  return call<T>("exthost_call", { m, p });
}

export function hostNotify(e: string, p?: unknown) {
  void call("exthost_notify", { e, p }).catch(() => {});
}

function wire() {
  if (wired) return;
  wired = true;
  void on<{ id: number; m: string; p: unknown }>("exthost-request", async ({ id, m, p }) => {
    try {
      const result = await handleRequest(m, p);
      await call("exthost_reply", { id, result: result ?? null });
    } catch (e) {
      await call("exthost_reply", { id, error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    }
  });
  void on<{ e: string; p: unknown }>("exthost-event", ({ e, p }) => handleEvent(e, p));
  void on<{ code: number | null }>("exthost-exit", () => {
    stopSync();
    clearHostUi();
    resetExtHost();
    // Host mati sendiri: coba lagi beberapa kali, lalu menyerah (pemakai bisa mulai ulang dari panel Ekstensi).
    if (restarts++ < 3) scheduleRestart(1500);
  });
}

export async function startHost(): Promise<void> {
  if (!isNative) return;
  // Mode terbatas (folder belum dipercaya): kode ekstensi tidak dijalankan.
  if (getState().restricted) {
    if (hostRunning()) await stopHost();
    return;
  }
  wire();
  const s = getState();
  useExtHost.setState({ starting: true });
  clearHostUi();
  try {
    const r = await call<{ count: number }>("exthost_start", { root: s.root, folders: s.extraRoots, settings: s.settings.extSettings, core: coreSettings(), trusted: s.settings.trustedExts, disabled: s.settings.disabledExts });
    resetExtHost();
    if (r.count > 0) {
      useExtHost.setState({ running: true, count: r.count });
      startSync();
      // Task dari ekstensi baru tersedia setelah ekstensinya aktif.
      setTimeout(() => void import("../app/actions").then((A) => A.refreshRunTargets()), 4000);
    }
  } catch (e) {
    console.warn("Extension host gagal dimulai", e);
    useExtHost.setState({ running: false });
  } finally {
    useExtHost.setState({ starting: false });
  }
}

export async function stopHost() {
  stopSync();
  await call("exthost_stop").catch(() => {});
  clearHostUi();
  resetExtHost();
}

/** Mulai ulang host (ditunda; beberapa perubahan beruntun jadi satu). */
export function scheduleRestart(ms = 400) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    void startHost();
  }, ms);
}

/** Kirim ulang pengaturan ke host (mis. setelah tema terang/gelap berganti; skemanya baru terbaca dari DOM). */
export function notifyConfig() {
  if (hostRunning()) hostNotify("config/set", { settings: getState().settings.extSettings, core: coreSettings() });
}

let watching = false;
/** Pantau perubahan yang mengharuskan host dimulai ulang: folder, ekstensi dipercaya/dimatikan, daftar terpasang. */
export function watchHostInputs() {
  if (watching) return;
  watching = true;
  let key = "";
  const sig = () => {
    const s = getState();
    return JSON.stringify([s.root, s.extraRoots, s.restricted, s.settings.trustedExts, s.settings.disabledExts]);
  };
  key = sig();
  useStore.subscribe(() => {
    const k = sig();
    if (k === key) return;
    key = k;
    restarts = 0;
    scheduleRestart();
  });
  // Pengaturan berubah: cukup kabari host (tanpa restart).
  let cfg = JSON.stringify([getState().settings.extSettings, coreSettings()]);
  useStore.subscribe((s) => {
    const next = JSON.stringify([s.settings.extSettings, coreSettings()]);
    if (next === cfg) return;
    cfg = next;
    if (hostRunning()) hostNotify("config/set", { settings: s.settings.extSettings, core: coreSettings() });
  });
}
