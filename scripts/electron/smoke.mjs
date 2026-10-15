// Jalankan Electron (mode dev) dengan skrip uji di renderer. Pemakaian:
//   node scripts/electron/smoke.mjs <skrip.js> [screenshot.png]
import { spawn } from "node:child_process";
import path from "node:path";
import electronPath from "electron";
import { createServer } from "vite";
import { buildAll } from "./build.mjs";

const [script, shot] = process.argv.slice(2);
await buildAll();
// Port terpisah dari `npm run dev` (1420) supaya uji bisa jalan saat server dev aktif.
const port = Number(process.env.NOZEL_SMOKE_PORT) || 1421;
const server = await createServer({ server: { port, strictPort: true }, logLevel: "error" });
await server.listen();
const child = spawn(electronPath, ["."], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${port}`, NOZEL_SMOKE: path.resolve(script), NOZEL_SMOKE_SHOT: shot ? path.resolve(shot) : "" },
});
child.stdout.on("data", (d) => process.stdout.write(d));
child.stderr.on("data", (d) => {
  const s = d.toString();
  if (!/Autofill|DevTools|GPU process|ERROR:CONSOLE/.test(s)) process.stderr.write(s);
});
const timer = setTimeout(() => child.kill("SIGKILL"), Number(process.env.NOZEL_SMOKE_TIMEOUT) || 120000);
child.on("exit", async (code) => {
  clearTimeout(timer);
  await server.close();
  process.exit(code ?? 1);
});
