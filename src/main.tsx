import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyDesign, cachedDesign } from "./design/designs";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shells.css";

// Handle debug untuk pengujian di mode dev saja (tidak ikut build produksi).
if (import.meta.env.DEV) {
  void Promise.all([import("./editor/documents"), import("./app/actions"), import("./state/store")]).then(([docs, actions, store]) => {
    (window as unknown as { __nozel: unknown }).__nozel = { docs, actions, store };
  });
}

// Terapkan desain terakhir sebelum render supaya tidak berkedip.
const d = cachedDesign();
applyDesign(d.id, d.accent);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
