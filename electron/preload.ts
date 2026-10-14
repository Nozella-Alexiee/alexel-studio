// Jembatan aman renderer ↔ main. Hanya dua pintu yang dibuka: invoke(command) dan on(event).
// Renderer tidak pernah mendapat akses Node atau ipcRenderer mentah.

import { contextBridge, ipcRenderer, webUtils } from "electron";

type Reply = { ok: true; value: unknown } | { ok: false; error: string };

contextBridge.exposeInMainWorld("nozel", {
  platform: process.platform,
  invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
    const r = (await ipcRenderer.invoke("nozel:invoke", cmd, args)) as Reply;
    if (!r.ok) throw new Error(r.error);
    return r.value;
  },
  on: (event: string, cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, name: string, payload: unknown) => {
      if (name === event) cb(payload);
    };
    ipcRenderer.on("nozel:event", listener);
    return () => ipcRenderer.removeListener("nozel:event", listener);
  },
  /** Path asli berkas yang di-drop dari Finder. */
  pathForFile: (file: File) => webUtils.getPathForFile(file),
});
