// Sisi renderer untuk katalog Open VSX: pencarian, kecocokan (dengan cache & antrean), pembaruan.

import { call } from "../lib/ipc";

export interface Result {
  id: string;
  namespace: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  downloads: number;
  icon: string | null;
  verified: boolean;
  rating: number | null;
  reviews: number;
  manifestUrl: string | null;
}

export type SortBy = "relevance" | "downloadCount" | "averageRating" | "timestamp";

export interface SearchPage {
  items: Result[];
  total: number;
  offset: number;
}

export interface Compat {
  level: "full" | "partial" | "host" | "none";
  data: string[];
  code: boolean;
  needs: string[];
  alt: string | null;
  server: string | null;
}

export interface Details {
  id: string;
  displayName: string;
  description: string;
  version: string;
  versions: string[];
  rating: number | null;
  reviews: number;
  downloads: number;
  verified: boolean;
  license: string | null;
  homepage: string | null;
  repository: string | null;
  categories: string[];
  tags: string[];
  publisher: string;
  readme: string;
  changelog: string;
  compat: Compat;
}

export interface Update {
  id: string;
  installed: string;
  latest: string;
}

export const searchExtensions = (o: { query: string; category?: string | null; sortBy?: SortBy; offset?: number; size?: number }) => call<SearchPage>("ext_search", o);

/** Kategori/penelusuran siap pakai di panel. `query` ditambahkan di depan pencarian pemakai. */
export interface Chip {
  id: string;
  category?: string;
  query?: string;
  /** Urutan bawaan saat tanpa kata kunci. */
  sort: SortBy;
}

export const CHIPS: Chip[] = [
  { id: "all", sort: "downloadCount" },
  { id: "themes", category: "Themes", sort: "downloadCount" },
  { id: "icons", category: "Themes", query: "icon theme", sort: "downloadCount" },
  { id: "langs", category: "Programming Languages", sort: "downloadCount" },
  { id: "snippets", category: "Snippets", sort: "downloadCount" },
  { id: "formatters", category: "Formatters", sort: "downloadCount" },
  { id: "linters", category: "Linters", sort: "downloadCount" },
  { id: "keymaps", category: "Keymaps", sort: "downloadCount" },
];

// Kecocokan dicek lewat package.json kecil per ekstensi; dibatasi 4 permintaan bersamaan.
const compatCache = new Map<string, Promise<Compat>>();
let active = 0;
const waiting: (() => void)[] = [];

function slot(): Promise<void> {
  if (active < 4) {
    active++;
    return Promise.resolve();
  }
  return new Promise((r) => waiting.push(() => { active++; r(); }));
}

export function inspectExtension(r: Pick<Result, "namespace" | "name" | "manifestUrl">): Promise<Compat> {
  const url = r.manifestUrl;
  if (!url) return Promise.reject(new Error("no manifest"));
  let p = compatCache.get(url);
  if (!p) {
    p = slot()
      .then(() => call<Compat>("ext_inspect", { namespace: r.namespace, name: r.name, manifestUrl: url }))
      .finally(() => {
        active--;
        waiting.shift()?.();
      });
    p.catch(() => compatCache.delete(url));
    compatCache.set(url, p);
  }
  return p;
}

export const fetchDetails = (namespace: string, name: string) => call<Details>("ext_details", { namespace, name });
export const checkUpdates = () => call<Update[]>("ext_updates");

export const fmtDl = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(n));
