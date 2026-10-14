// Mode dev: Vite (renderer, HMR) + esbuild watch (main/preload) + Electron yang restart otomatis.
import { spawn } from "node:child_process";
import { createServer } from "vite";
import electronPath from "electron";
import { watchAll } from "./build.mjs";

const server = await createServer({ server: { port: 1420, strictPort: true } });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
console.log(`\n  Renderer: ${url}\n`);

let child = null;
let restarting = false;
function start() {
  child = spawn(electronPath, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_SERVER_URL: url } });
  child.on("exit", () => {
    if (!restarting) {
      void server.close();
      process.exit(0);
    }
  });
}
let timer = null;
await watchAll(() => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!child) return start();
    restarting = true;
    child.once("exit", () => {
      restarting = false;
      start();
    });
    child.kill();
  }, 150);
});
