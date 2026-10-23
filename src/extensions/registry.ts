// Registry ekstensi terpasang: tema, snippet, bahasa ber-grammar. Dimuat saat aplikasi mulai.

import { applyDesign } from "../design/designs";
import { snippetCompletion, type Completion } from "@codemirror/autocomplete";
import { create } from "zustand";
import { call, isNative } from "../lib/ipc";
import { getState, toast } from "../state/store";
import { parseJsonc, resolveTheme, themeToVars, applyThemeVars } from "./theme";

export interface InstalledExt {
  id: string;
  displayName: string;
  version: string;
  description: string;
  themes: { label: string; uiTheme: string; path: string }[];
  iconThemes: { id: string; label: string; path: string }[];
  snippets: { language: string; path: string }[];
  grammars: { language?: string; scopeName: string; path: string; injectTo?: string[] }[];
  languages: { id: string; aliases?: string[]; extensions?: string[]; filenames?: string[]; configuration?: string }[];
  installedAt: number;
  namespace?: string;
  name?: string;
}

export const useExtensions = create<{ list: InstalledExt[]; loaded: boolean }>(() => ({ list: [], loaded: false }));

/** Bandingkan versi: >0 bila a lebih baru dari b. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Ekstensi yang aktif: terpasang dan tidak dimatikan di Pengaturan. */
export const isExtDisabled = (id: string) => {
  const d = getState().settings.disabledExts;
  return Array.isArray(d) && d.includes(id);
};
const activeExts = () => useExtensions.getState().list.filter((e) => !isExtDisabled(e.id));

/** id bahasa VS Code → id bahasa Nozel (lihat editor/languages.ts). */
const LANG_MAP: Record<string, string> = {
  typescript: "ts",
  typescriptreact: "ts",
  javascript: "js",
  javascriptreact: "js",
  python: "py",
  rust: "rs",
  php: "php",
  html: "html",
  css: "css",
  scss: "css",
  less: "css",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  json: "json",
  jsonc: "jsonc",
  markdown: "md",
  yaml: "yaml",
  sql: "sql",
  xml: "xml",
};
export const mapLang = (vs: string) => LANG_MAP[vs] ?? vs;

const snippetCache = new Map<string, Completion[]>();
export function extSnippetsFor(langId: string): Completion[] {
  return snippetCache.get(langId) ?? [];
}

/** Body snippet VS Code ($1, ${1:x}, ${1|a,b|}, $TM_FILENAME) → sintaks snippet CodeMirror. */
export function convertSnippetBody(body: string | string[]): string {
  const text = Array.isArray(body) ? body.join("\n") : body;
  return text
    .replace(/\$\{(\d+)\|([^|,}]*)(?:,[^|}]*)*\|\}/g, (_m, n, first) => `\${${n}:${first}}`)
    .replace(/\$\{(TM_[A-Z_]+|CURRENT_[A-Z_]+|CLIPBOARD|UUID|RANDOM\w*|BLOCK_COMMENT_\w+|LINE_COMMENT)(?::([^}]*))?\}/g, (_m, _v, def) => def ?? "")
    .replace(/\$(TM_[A-Z_]+|CURRENT_[A-Z_]+|CLIPBOARD|UUID|RANDOM\w*)/g, "")
    .replace(/\$(\d+)/g, (_m, n) => `\${${n}}`)
    .replace(/\t/g, "\t");
}

async function loadSnippets(list: InstalledExt[]) {
  snippetCache.clear();
  for (const ext of list.filter((e) => !isExtDisabled(e.id))) {
    for (const sn of ext.snippets) {
      try {
        const json = parseJsonc(await call<string>("ext_read_file", { id: ext.id, path: sn.path })) as Record<string, { prefix?: string | string[]; body?: string | string[]; description?: string }>;
        const lang = mapLang(sn.language);
        const arr = snippetCache.get(lang) ?? [];
        for (const [name, s] of Object.entries(json)) {
          if (!s?.prefix || !s.body) continue;
          for (const prefix of Array.isArray(s.prefix) ? s.prefix : [s.prefix]) {
            arr.push(snippetCompletion(convertSnippetBody(s.body), { label: prefix, detail: s.description || name, type: "text", boost: -1 }));
          }
        }
        snippetCache.set(lang, arr.slice(0, 2000));
      } catch {
        /* snippet rusak dilewati */
      }
    }
  }
}

/** language-configuration.json milik bahasa ekstensi (komentar, kurung); null bila tidak ada/rusak. */
export async function languageConfig(ref: { ext: string; path: string } | undefined): Promise<import("./textmate").LanguageConfig | null> {
  if (!ref) return null;
  try {
    return parseJsonc(await call<string>("ext_read_file", { id: ref.ext, path: ref.path })) as import("./textmate").LanguageConfig;
  } catch {
    return null;
  }
}

/** Bahasa ber-grammar dari ekstensi untuk nama berkas tertentu. */
export function extLanguageFor(filename: string): { name: string; id: string; scopeName: string; configuration?: { ext: string; path: string } } | null {
  const lower = filename.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  for (const ext of activeExts()) {
    for (const lang of ext.languages) {
      const hit = lang.extensions?.some((e) => base.endsWith(e.toLowerCase())) || lang.filenames?.some((f) => f.toLowerCase() === base);
      if (!hit) continue;
      const g = ext.grammars.find((x) => x.language === lang.id);
      if (g) return { name: lang.aliases?.[0] ?? lang.id, id: lang.id, scopeName: g.scopeName, configuration: lang.configuration ? { ext: ext.id, path: lang.configuration } : undefined };
    }
  }
  return null;
}

/**
 * Grammar bawaan VS Code yang sering di-embed grammar lain (mis. Svelte/Astro/Vue memakai JS, TS, CSS).
 * Di VS Code grammar ini sudah terpasang; di Nozel diambil sekali dari namespace resmi "vscode" di Open VSX.
 */
// Sengaja hanya grammar yang lazim di-embed. Grammar Markdown/Python/YAML tidak ikut, supaya
// satu grammar tidak memicu rantai pemasangan belasan ekstensi lewat blok kode berpagar.
const BUILTIN_SCOPES: Record<string, string> = {
  "source.js": "javascript",
  "source.js.jsx": "javascript",
  "source.js.regexp": "javascript",
  "source.ts": "typescript",
  "source.tsx": "typescript",
  "source.css": "css",
  "source.css.scss": "scss",
  "source.css.less": "less",
  "text.html.basic": "html",
  "text.html.derivative": "html",
};
const pendingBuiltin = new Map<string, Promise<boolean>>();

function findGrammar(scopeName: string) {
  for (const ext of activeExts()) {
    const g = ext.grammars.find((x) => x.scopeName === scopeName);
    if (g) return { ext, g };
  }
  return null;
}

/** Pasang grammar bawaan pendukung (sekali per sesi per ekstensi); true bila berhasil. */
function installBuiltin(name: string): Promise<boolean> {
  let p = pendingBuiltin.get(name);
  if (!p) {
    p = (async () => {
      try {
        toast(`Memasang grammar pendukung: ${name}`, "info");
        await call("ext_install", { namespace: "vscode", name });
        useExtensions.setState({ list: await call<InstalledExt[]>("ext_list") });
        return true;
      } catch (e) {
        console.warn("Grammar pendukung gagal dipasang", name, e);
        return false;
      }
    })();
    pendingBuiltin.set(name, p);
  }
  return p;
}

async function grammarReader(scopeName: string) {
  let hit = findGrammar(scopeName);
  const builtin = BUILTIN_SCOPES[scopeName];
  if (!hit && builtin && (await installBuiltin(builtin))) hit = findGrammar(scopeName);
  if (!hit) return null;
  return { content: await call<string>("ext_read_file", { id: hit.ext.id, path: hit.g.path }), path: hit.g.path };
}

/** Grammar yang menyuntik (injectTo) ke scope tertentu, mis. komentar JSDoc ke source.ts. */
function injectionsFor(scopeName: string): string[] {
  const out: string[] = [];
  for (const ext of activeExts()) for (const g of ext.grammars) if (g.injectTo?.includes(scopeName)) out.push(g.scopeName);
  return out;
}

export async function loadExtensions() {
  if (!isNative) {
    useExtensions.setState({ list: [], loaded: true });
    return;
  }
  const list = await call<InstalledExt[]>("ext_list").catch(() => []);
  useExtensions.setState({ list, loaded: true });
  const tm = await import("./textmate");
  tm.setGrammarReader(grammarReader, injectionsFor);
  await applySavedIconTheme();
  // Tab yang dipulihkan sebelum daftar ekstensi siap perlu dideteksi ulang bahasanya.
  (await import("../editor/documents")).redetectLanguages();
  await loadSnippets(list);
  await applySavedTheme();
}

/** Setelah warna berubah (desain / tema ekstensi): editor, terminal & warna tombol jendela OS ikut menyesuaikan. */
function themeChanged() {
  void import("../editor/documents").then((d) => requestAnimationFrame(() => d.applyEditorSettings()));
  void import("../app/actions").then((a) => a.syncTrafficLights());
  window.dispatchEvent(new Event("alexel:theme"));
}

/** Setelah ekstensi dimatikan/dihidupkan: terapkan ulang tema, ikon, snippet, dan deteksi bahasa. */
export async function reapplyExtensions() {
  await applySavedIconTheme();
  (await import("../editor/documents")).redetectLanguages();
  await loadSnippets(useExtensions.getState().list);
  await applySavedTheme();
}

export async function applySavedTheme() {
  const s = getState().settings;
  const t = s.extTheme;
  // Tanpa tema ekstensi (atau gagal dimuat), kembalikan skema warna milik desain (terang/gelap).
  const plain = () => {
    applyThemeVars(null);
    applyDesign(s.design, s.accent);
    themeChanged();
  };
  if (!t) return plain();
  const ext = activeExts().find((e) => e.id === t.ext);
  if (!ext) return plain();
  try {
    const theme = await resolveTheme((rel) => call<string>("ext_read_file", { id: ext.id, path: rel }), t.path);
    const { vars, scheme } = themeToVars(theme, t.uiTheme);
    applyThemeVars(vars, scheme);
    themeChanged();
  } catch (e) {
    console.warn("Tema ekstensi gagal", e);
    plain();
  }
}

export async function applySavedIconTheme() {
  const { useIconTheme, resolveIconTheme } = await import("./icons");
  // Ekstensi berkas dari bahasa ekstensi (mis. .svelte → svelte) untuk pemetaan languageIds.
  const extLangs = new Map<string, string>();
  for (const ext of activeExts()) for (const l of ext.languages) for (const e of l.extensions ?? []) extLangs.set(e.replace(/^\./, "").toLowerCase(), l.id);
  const t = getState().settings.iconTheme;
  const ext = t && activeExts().find((e) => e.id === t.ext);
  if (!t || !ext) {
    useIconTheme.setState({ theme: null, extLangs });
    return;
  }
  try {
    const json = parseJsonc(await call<string>("ext_read_file", { id: ext.id, path: t.path })) as import("./icons").VsIconTheme;
    useIconTheme.setState({ theme: resolveIconTheme(json, ext.id, t.path), extLangs });
  } catch (e) {
    console.warn("Tema ikon gagal", e);
    useIconTheme.setState({ theme: null, extLangs });
  }
}
