import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyDesign, cachedDesign } from "./design/designs";
import { platform } from "./lib/ipc";
import "@fontsource-variable/nunito";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/fira-code";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shells.css";
import "./styles/penguin.css";

// Handle debug untuk pengujian di mode dev saja (tidak ikut build produksi).
if (import.meta.env.DEV) {
  void Promise.all([import("./editor/documents"), import("./app/actions"), import("./state/store"), import("@codemirror/lsp-client"), import("@codemirror/autocomplete"), import("./terminal/terminals")]).then(
    ([docs, actions, store, lspClient, autocomplete, terminals]) => {
      (window as unknown as { __nozel: unknown }).__nozel = { docs, actions, store, lspClient, autocomplete, terminals };
    }
  );
}

// Promise yang gagal tanpa catch (mis. panggilan IPC `void api.x()`) dicatat di Output, bukan hilang di konsol.
window.addEventListener("unhandledrejection", (e) => {
  const r: unknown = e.reason;
  const msg = r instanceof Error ? r.message : typeof r === "string" ? r : (r as { message?: string } | null)?.message ?? String(r);
  void import("./app/output").then((m) => m.logOutput("Alexel Studio", msg)).catch(() => {});
});

// Platform untuk CSS (title bar, ruang tombol jendela).
document.documentElement.dataset.platform = platform;
// Layar penuh macOS menyembunyikan lampu lalu lintas, jadi ruang kosongnya di titlebar ikut dilepas.
const syncFullscreen = () => {
  const full = window.innerWidth >= screen.width && window.innerHeight >= screen.height;
  document.documentElement.toggleAttribute("data-fullscreen", full);
};
window.addEventListener("resize", syncFullscreen);
syncFullscreen();
// Terapkan desain terakhir sebelum render supaya tidak berkedip.
const d = cachedDesign();
applyDesign(d.id, d.accent);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
