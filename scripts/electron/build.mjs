// Bundel main process & preload Electron dengan esbuild ke dist-electron/.
import { pathToFileURL } from "node:url";
import { build, context } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  external: ["electron", "node-pty", "@parcel/watcher"],
};

export const entries = [
  { entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" },
  { entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" },
];

export async function buildAll() {
  await Promise.all(entries.map((e) => build({ ...shared, ...e, minify: true })));
}

export async function watchAll(onRebuild) {
  const ctxs = await Promise.all(
    entries.map((e) =>
      context({
        ...shared,
        ...e,
        plugins: [{ name: "notify", setup: (b) => b.onEnd((r) => !r.errors.length && onRebuild?.()) }],
      })
    )
  );
  await Promise.all(ctxs.map((c) => c.watch()));
  return ctxs;
}

// pathToFileURL: benar di Windows (file:///C:/...) dan untuk path berisi spasi.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildAll();
