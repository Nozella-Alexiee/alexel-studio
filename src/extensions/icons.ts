// Tema ikon berkas VS Code (iconDefinitions + pemetaan nama/ekstensi/bahasa) → URL gambar.
// Gambar disajikan main process lewat nozelext://icons/<id>/<path> dan dipakai sebagai <img>.

import { useSyncExternalStore } from "react";
import { create } from "zustand";

interface IconMap {
  file?: string;
  folder?: string;
  folderExpanded?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  languageIds?: Record<string, string>;
}

export interface VsIconTheme extends IconMap {
  iconDefinitions?: Record<string, { iconPath?: string }>;
  light?: IconMap;
}

interface Lookup {
  file?: string;
  folder?: string;
  folderExpanded?: string;
  fileExtensions: Map<string, string>;
  fileNames: Map<string, string>;
  folderNames: Map<string, string>;
  folderNamesExpanded: Map<string, string>;
  languageIds: Map<string, string>;
}

export interface ResolvedIconTheme {
  urls: Map<string, string>;
  dark: Lookup;
  light: Lookup;
}

export const useIconTheme = create<{
  theme: ResolvedIconTheme | null;
  extLangs: Map<string, string>;
}>(() => ({ theme: null, extLangs: new Map() }));

/** Ekstensi berkas → id bahasa VS Code (banyak tema ikon memetakan lewat languageIds). */
const EXT_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  py: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  php: "php",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  fish: "fish",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  svg: "xml",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  lua: "lua",
  sql: "sql",
  toml: "toml",
  ini: "ini",
  bat: "bat",
  ps1: "powershell",
  r: "r",
  pl: "perl",
  hs: "haskell",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  clj: "clojure",
  scala: "scala",
  groovy: "groovy",
  gradle: "groovy",
  txt: "plaintext",
  log: "log",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",
  tf: "terraform",
  zig: "zig",
  coffee: "coffeescript",
  fs: "fsharp",
  m: "objective-c",
  mm: "objective-cpp",
  diff: "diff",
  patch: "diff",
  tex: "latex",
  vb: "vb",
  jl: "julia",
  nim: "nim",
  proto: "proto3",
};
const NAME_LANG: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  ".gitignore": "ignore",
  ".env": "dotenv",
};

const lower = (m?: Record<string, string>) =>
  new Map(Object.entries(m ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

function lookup(base: IconMap, over?: IconMap): Lookup {
  const merged = (k: keyof IconMap) => ({
    ...((base[k] as Record<string, string>) ?? {}),
    ...((over?.[k] as Record<string, string>) ?? {}),
  });
  return {
    file: over?.file ?? base.file,
    folder: over?.folder ?? base.folder,
    folderExpanded: over?.folderExpanded ?? base.folderExpanded,
    fileExtensions: lower(merged("fileExtensions")),
    fileNames: lower(merged("fileNames")),
    folderNames: lower(merged("folderNames")),
    folderNamesExpanded: lower(merged("folderNamesExpanded")),
    languageIds: lower(merged("languageIds")),
  };
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
}

/** Ubah JSON tema ikon menjadi tabel pencarian + URL per definisi ikon. */
export function resolveIconTheme(
  theme: VsIconTheme,
  extId: string,
  themePath: string,
): ResolvedIconTheme {
  const dir = themePath.includes("/")
    ? themePath.slice(0, themePath.lastIndexOf("/") + 1)
    : "";
  const urls = new Map<string, string>();
  for (const [id, def] of Object.entries(theme.iconDefinitions ?? {})) {
    if (!def?.iconPath || !/\.(svg|png)$/i.test(def.iconPath)) continue;
    const rel = normalize(dir + def.iconPath);
    urls.set(
      id,
      `nozelext://icons/${encodeURIComponent(extId)}/${rel.split("/").map(encodeURIComponent).join("/")}`,
    );
  }
  return { urls, dark: lookup(theme), light: lookup(theme, theme.light) };
}

/** Id ikon untuk satu berkas/folder (urutan sama seperti VS Code: nama → ekstensi → bahasa → default). */
export function iconIdFor(
  L: Lookup,
  name: string,
  kind: "file" | "folder",
  open = false,
  extLangs?: Map<string, string>,
): string | undefined {
  const n = name.toLowerCase();
  if (kind === "folder")
    return (
      (open ? L.folderNamesExpanded.get(n) : L.folderNames.get(n)) ??
      (open ? (L.folderExpanded ?? L.folder) : L.folder)
    );
  const byName = L.fileNames.get(n);
  if (byName) return byName;
  const parts = n.split(".");
  // Ekstensi majemuk dulu: "a.test.ts" → "test.ts" lalu "ts".
  for (let i = 1; i < parts.length; i++) {
    const hit = L.fileExtensions.get(parts.slice(i).join("."));
    if (hit) return hit;
  }
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  const lang = NAME_LANG[n] ?? extLangs?.get(ext) ?? EXT_LANG[ext];
  return (lang && L.languageIds.get(lang)) || L.file;
}

// Skema terang/gelap aktif (dari data-scheme di <html>), supaya varian "light" tema ikon ikut.
const schemeListeners = new Set<() => void>();
let schemeObserver: MutationObserver | null = null;
function subscribeScheme(cb: () => void) {
  schemeListeners.add(cb);
  if (!schemeObserver && typeof MutationObserver !== "undefined") {
    schemeObserver = new MutationObserver(() =>
      schemeListeners.forEach((l) => l()),
    );
    schemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-scheme"],
    });
  }
  return () => schemeListeners.delete(cb);
}
const getScheme = () =>
  document.documentElement.dataset.scheme === "light" ? "light" : "dark";

/** URL ikon dari tema ikon aktif, atau null bila tidak ada tema ikon / tidak ada ikon yang cocok. */
export function useIconUrl(
  name: string,
  kind: "file" | "folder",
  open = false,
): string | null {
  const theme = useIconTheme((s) => s.theme);
  const extLangs = useIconTheme((s) => s.extLangs);
  const scheme = useSyncExternalStore(subscribeScheme, getScheme, () => "dark");
  if (!theme) return null;
  const id = iconIdFor(
    scheme === "light" ? theme.light : theme.dark,
    name,
    kind,
    open,
    extLangs,
  );
  return (id && theme.urls.get(id)) || null;
}
