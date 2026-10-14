// Memantau folder project (@parcel/watcher, native FSEvents) dan mengirim `fs-changed` yang di-debounce.

import path from "node:path";
import type { AsyncSubscription } from "@parcel/watcher";
import type { Ctx } from "./util";

const NOISY = ["/node_modules/", "/target/", "/.git/objects/", "/.git/logs/", "/dist/", "/dist-electron/", "/.next/", "/__pycache__/", "/.turbo/"];

/** [abaikan?, perubahan git?] */
export function classify(p: string): [boolean, boolean] {
  const s = p.split(path.sep).join("/");
  if (s.includes(".nozel-tmp-") || s.endsWith(".DS_Store")) return [true, false];
  if (s.includes("/.git/")) {
    const name = s.slice(s.lastIndexOf("/") + 1);
    return [true, name === "HEAD" || name === "index" || s.includes("/.git/refs/") || name === "MERGE_HEAD"];
  }
  return [NOISY.some((n) => s.includes(n)), false];
}

let sub: AsyncSubscription | null = null;
let token = 0;

export async function watchProject(ctx: Ctx, root: string, debounceMs: number) {
  const my = ++token;
  await unwatch();
  if (!root) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const watcher = require("@parcel/watcher") as typeof import("@parcel/watcher");
  const paths = new Set<string>();
  let git = false;
  let timer: NodeJS.Timeout | null = null;
  const wait = Math.min(5000, Math.max(100, debounceMs));
  const flush = () => {
    timer = null;
    if (my !== token) return;
    ctx.emit("fs-changed", { root, paths: [...paths].slice(0, 500), git });
    paths.clear();
    git = false;
  };
  const s = await watcher.subscribe(
    root,
    (err, events) => {
      if (err || my !== token) return;
      for (const e of events) {
        const [ign, isGit] = classify(e.path);
        git ||= isGit;
        if (!ign) paths.add(e.path);
      }
      if ((paths.size || git) && !timer) timer = setTimeout(flush, wait);
    },
    { ignore: ["**/node_modules/**", "**/target/**", "**/.git/objects/**", "**/dist/**", "**/.next/**"] }
  );
  if (my !== token) await s.unsubscribe();
  else sub = s;
}

export async function unwatch() {
  const s = sub;
  sub = null;
  await s?.unsubscribe().catch(() => {});
}
