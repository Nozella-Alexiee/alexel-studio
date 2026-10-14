// Pencarian seluruh project (menghormati .gitignore), Quick Open, replace, TODO, ringkasan project.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { snapshot } from "./history";
import { writeAtomic } from "./fsOps";
import { HEAVY_DIRS, type Ctx } from "./util";

const MAX_FILES = 60_000;
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MATCHES = 3000;

interface Rules {
  base: string;
  ig: Ignore;
}

function loadIgnore(dir: string): Rules | null {
  const rules: string[] = [];
  for (const name of [".gitignore", ".ignore"]) {
    try {
      rules.push(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      /* tidak ada */
    }
  }
  if (dir.endsWith(path.sep + ".git") || !rules.length) return null;
  return { base: dir, ig: ignore().add(rules.join("\n")) };
}

function ignored(stack: Rules[], abs: string, isDir: boolean): boolean {
  for (const r of stack) {
    let rel = path.relative(r.base, abs).split(path.sep).join("/");
    if (!rel || rel.startsWith("..")) continue;
    if (isDir) rel += "/";
    if (r.ig.ignores(rel)) return true;
  }
  return false;
}

/** Semua berkas (path absolut) di project, maksimal 60 ribu. */
export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string, stack: Rules[]) => {
    if (out.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const own = loadIgnore(dir);
    const s = own ? [...stack, own] : stack;
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (e.name === ".DS_Store" || e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (HEAVY_DIRS.has(e.name) || ignored(s, abs, true)) continue;
        await visit(abs, s);
      } else if (e.isFile()) {
        if (!ignored(s, abs, false)) out.push(abs);
      }
    }
  };
  await visit(root, []);
  return out;
}

async function readTextSmall(p: string): Promise<string | null> {
  try {
    const st = await fsp.stat(p);
    if (st.size > MAX_SEARCH_FILE_BYTES) return null;
    const buf = await fsp.readFile(p);
    if (buf.subarray(0, 4096).includes(0)) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

const rel = (root: string, p: string) => path.relative(root, p).split(path.sep).join("/");

export async function listProjectFiles(root: string): Promise<string[]> {
  return (await walkFiles(root)).map((p) => rel(root, p));
}

export function buildRegex(query: string, isRegex: boolean, caseSensitive: boolean, wholeWord: boolean): RegExp {
  let pat = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (wholeWord) pat = `\\b(?:${pat})\\b`;
  try {
    return new RegExp(pat, caseSensitive ? "g" : "gi");
  } catch (e) {
    throw new Error(`Regex tidak valid: ${(e as Error).message}`);
  }
}

export interface SearchMatch {
  path: string;
  rel: string;
  line: number;
  col: number;
  len: number;
  text: string;
}

export async function searchProject(root: string, query: string, o: { isRegex: boolean; caseSensitive: boolean; wholeWord: boolean; include?: string | null }) {
  if (!query) return { matches: [], files_searched: 0, truncated: false };
  const re = buildRegex(query, o.isRegex, o.caseSensitive, o.wholeWord);
  const inc = (o.include ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim().replace(/^\*/, ""))
    .filter(Boolean);
  const matches: SearchMatch[] = [];
  let filesSearched = 0;
  let truncated = false;
  for (const p of await walkFiles(root)) {
    const r = rel(root, p);
    if (inc.length && !inc.some((i) => r.toLowerCase().includes(i))) continue;
    const text = await readTextSmall(p);
    if (text === null) continue;
    filesSearched++;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\r$/, "");
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        const start = Math.max(0, m.index - 60);
        matches.push({ path: p, rel: r, line: i + 1, col: m.index + 1, len: m[0].length, text: line.length > 240 ? line.slice(start, start + 240) : line });
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          return { matches, files_searched: filesSearched, truncated };
        }
      }
    }
  }
  return { matches, files_searched: filesSearched, truncated };
}

export async function replaceInFiles(ctx: Ctx, paths: string[], query: string, replacement: string, o: { isRegex: boolean; caseSensitive: boolean; wholeWord: boolean }): Promise<number> {
  const re = buildRegex(query, o.isRegex, o.caseSensitive, o.wholeWord);
  let total = 0;
  for (const p of paths) {
    const text = await readTextSmall(p);
    if (text === null) continue;
    const n = text.match(re)?.length ?? 0;
    if (!n) continue;
    const out = o.isRegex ? text.replace(re, replacement) : text.replace(re, () => replacement);
    await writeAtomic(p, out);
    snapshot(ctx, p, out);
    total += n;
  }
  return total;
}

export interface TodoItem {
  path: string;
  rel: string;
  line: number;
  tag: string;
  text: string;
}

export const TODO_RE = /(?:^|[^A-Za-z0-9_])(TODO|FIXME|HACK|BUG|XXX|NOTE)\b[:\s(]*(.*)/;

export function parseTodoLine(line: string): { tag: string; text: string } | null {
  const m = TODO_RE.exec(line);
  if (!m) return null;
  const text = m[2]
    .trim()
    .replace(/\*\/\s*$/, "")
    .replace(/-->\s*$/, "")
    .trim()
    .replace(/^[):]+/, "")
    .trim();
  return { tag: m[1], text: text.slice(0, 200) };
}

export async function scanTodos(root: string): Promise<TodoItem[]> {
  const out: TodoItem[] = [];
  for (const p of await walkFiles(root)) {
    const text = await readTextSmall(p);
    if (text === null) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const t = parseTodoLine(lines[i]);
      if (t) {
        out.push({ path: p, rel: rel(root, p), line: i + 1, ...t });
        if (out.length >= 5000) return out;
      }
    }
  }
  return out;
}

export async function projectOverview(root: string) {
  const st = await fsp.stat(root).catch(() => null);
  if (!st?.isDirectory()) throw new Error("Folder project tidak ditemukan.");
  const files = await walkFiles(root);
  const byExt = new Map<string, { files: number; bytes: number }>();
  let total = 0;
  let newest = { t: 0, f: null as string | null };
  for (const p of files) {
    const s = await fsp.stat(p).catch(() => null);
    if (!s) continue;
    total += s.size;
    const ext = path.extname(p).slice(1).toLowerCase() || "lainnya";
    const e = byExt.get(ext) ?? { files: 0, bytes: 0 };
    e.files++;
    e.bytes += s.size;
    byExt.set(ext, e);
    if (s.mtimeMs > newest.t) newest = { t: Math.floor(s.mtimeMs), f: rel(root, p) };
  }
  const languages = [...byExt].map(([ext, v]) => ({ ext, ...v })).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  return {
    name: path.basename(root),
    file_count: files.length,
    total_bytes: total,
    languages,
    last_modified_ms: newest.t,
    last_modified_file: newest.f,
    truncated: files.length >= MAX_FILES,
  };
}
