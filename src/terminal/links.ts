// Tautan lokasi di output terminal: `src/a.ts:12:5`, `a.ts(12,5)`, `File "x.py", line 3`, `--> main.rs:5:9`,
// `at f (/p/a.js:1:2)`. Cmd/Ctrl+klik membuka berkas di baris itu (seperti terminal VS Code).

import type { IBufferRange, ILink, Terminal } from "@xterm/xterm";
import { api } from "../lib/ipc";
import { isWindows } from "../lib/ipc";
import { join } from "../lib/paths";
import { getState } from "../state/store";

export interface Location {
  /** Posisi (indeks 0) teks tautan di baris, dan panjangnya. */
  start: number;
  length: number;
  path: string;
  line: number;
  col: number;
}

// path: huruf drive Windows opsional + karakter path; harus punya titik-ekstensi atau pemisah folder.
const PATH = String.raw`(?:[A-Za-z]:[\\/]|~?[\\/])?(?:[\w@.~+-]+[\\/])*[\w@.~+-]+\.[A-Za-z][A-Za-z0-9]{0,7}`;
const COLON = new RegExp(String.raw`(?<![\w:/\\.-])(${PATH}):(\d+)(?::(\d+))?`, "g");
const PAREN = new RegExp(String.raw`(?<![\w:/\\.-])(${PATH})\((\d+)(?:,\s*(\d+))?\)`, "g");
const PYTHON = /File "([^"]+)", line (\d+)/g;

/** Semua lokasi berkas pada satu baris teks (tanpa memeriksa apakah berkasnya ada). */
export function findLocations(text: string): Location[] {
  const out: Location[] = [];
  const add = (m: RegExpMatchArray, pathIdx = 1) => {
    const path = m[pathIdx];
    const line = Number(m[pathIdx + 1]);
    // Bukan URL (http://host:8080/x.js:1) dan bukan angka versi ("1.2.3:4").
    if (!path || !line || /^\d+(\.\d+)+$/.test(path) || /[a-z]+:\/\/[^\s]*$/i.test(text.slice(0, m.index ?? 0) + path)) return;
    out.push({ start: m.index ?? 0, length: m[0].length, path, line, col: Number(m[pathIdx + 2]) || 1 });
  };
  for (const m of text.matchAll(PYTHON)) {
    // Tautan hanya pada bagian "File "path", line N".
    out.push({ start: m.index ?? 0, length: m[0].length, path: m[1], line: Number(m[2]), col: 1 });
  }
  const taken = (s: number, e: number) => out.some((o) => s < o.start + o.length && e > o.start);
  for (const re of [PAREN, COLON]) for (const m of text.matchAll(re)) if (!taken(m.index ?? 0, (m.index ?? 0) + m[0].length)) add(m);
  return out.sort((a, b) => a.start - b.start);
}

/** Kandidat path absolut untuk path yang tampil: absolut apa adanya, relatif dari cwd sesi lalu root project. */
export function candidates(path: string, cwd: string, root: string): string[] {
  const p = path.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[A-Za-z]:\//.test(p)) return [p];
  const rel = p.replace(/^\.\//, "");
  return [...new Set([cwd && join(cwd, rel), root && join(root, rel)].filter(Boolean) as string[])];
}

const cache = new Map<string, string | null>();

async function resolve(path: string, cwd: string): Promise<string | null> {
  const root = getState().root ?? "";
  const list = candidates(isWindows ? path : path, cwd, root);
  const key = list.join("|");
  if (cache.has(key)) return cache.get(key)!;
  const kinds = await api.pathKinds(list).catch(() => list.map(() => null));
  const hit = list.find((_, i) => kinds[i] === "file") ?? null;
  cache.set(key, hit);
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return hit;
}

export function registerLocationLinks(term: Terminal, cwdOf: () => string) {
  term.registerLinkProvider({
    provideLinks(y, done) {
      const buf = term.buffer.active.getLine(y - 1);
      const text = buf?.translateToString(true) ?? "";
      const locs = findLocations(text);
      if (!locs.length) return done(undefined);
      void Promise.all(
        locs.map(async (l): Promise<ILink | null> => {
          const abs = await resolve(l.path, cwdOf());
          if (!abs) return null;
          const range: IBufferRange = { start: { x: l.start + 1, y }, end: { x: l.start + l.length, y } };
          return {
            range,
            text: text.slice(l.start, l.start + l.length),
            decorations: { underline: true, pointerCursor: true },
            activate(e) {
              if (!(e.metaKey || e.ctrlKey)) return;
              void import("../app/actions").then((A) => A.openFile(abs, { line: l.line, col: l.col }));
            },
          };
        })
      ).then((r) => done(r.filter((x): x is ILink => !!x)));
    },
  });
}
