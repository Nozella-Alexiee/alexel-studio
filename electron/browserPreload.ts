// Preload tab browser (dunia terisolasi, tanpa akses Node untuk halaman). Satu-satunya tugas:
// meneruskan alert/confirm/prompt ke dialog native di main. Tanpa ini halaman yang memanggil alert()
// macet diam-diam karena WebContentsView tidak punya pengelola dialog sendiri.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__alexelDialog", (kind: string, message: unknown, def?: unknown) => ipcRenderer.sendSync("alexel-browser:dialog", String(kind), String(message ?? ""), def === undefined ? null : String(def)));

contextBridge.executeInMainWorld({
  func: () => {
    const w = globalThis as unknown as Record<string, unknown> & { __alexelDialog: (k: string, m: unknown, d?: unknown) => unknown };
    const bridge = w.__alexelDialog;
    w.alert = (m?: unknown) => void bridge("alert", m);
    w.confirm = (m?: unknown) => bridge("confirm", m) === true;
    w.prompt = (m?: unknown, d?: unknown) => bridge("prompt", m, d) as string | null;
    delete (w as Record<string, unknown>).__alexelDialog;
  },
});
