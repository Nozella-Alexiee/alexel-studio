// Render build/icon.svg → build/icon.png (1024) memakai Electron offscreen, lalu .icns lewat iconutil.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import electronPath from "electron";

const out = path.resolve("build/icon.png");
const runner = path.resolve("build/.render-icon.cjs");
fs.writeFileSync(
  runner,
  `const { app, BrowserWindow } = require("electron");
const fs = require("fs");
app.dock?.hide();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  const svg = fs.readFileSync(${JSON.stringify(path.resolve("build/icon.svg"))}, "utf8");
  await w.loadURL("data:text/html," + encodeURIComponent('<body style="margin:0;background:transparent">' + svg + "</body>"));
  await new Promise((r) => setTimeout(r, 400));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  fs.writeFileSync(${JSON.stringify(out)}, img.resize({ width: 1024, height: 1024 }).toPNG());
  app.exit(0);
});`
);
execFileSync(electronPath, [runner], { stdio: "inherit" });
fs.rmSync(runner);
if (process.platform === "darwin") {
  const set = path.resolve("build/icon.iconset");
  fs.mkdirSync(set, { recursive: true });
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync("sips", ["-z", String(s), String(s), out, "--out", path.join(set, `icon_${s}x${s}.png`)], { stdio: "ignore" });
    execFileSync("sips", ["-z", String(s * 2), String(s * 2), out, "--out", path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: "ignore" });
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", path.resolve("build/icon.icns")]);
  fs.rmSync(set, { recursive: true });
}
console.log("Ikon dibuat: build/icon.png, build/icon.icns");
