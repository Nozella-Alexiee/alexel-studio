// Tata letak diagram ER berlapis: tabel induk (yang dirujuk foreign key) di kiri, anak di kanan;
// urutan dalam satu lapis mengikuti rata-rata posisi induk supaya garis tidak banyak bersilangan.

import type { DbSchema, DbTable } from "../../electron/db/types";

export const ER = { w: 220, head: 28, row: 18, maxCols: 14, gapX: 90, gapY: 28, pad: 24 };

export interface ErNode {
  key: string;
  schema: string;
  table: DbTable;
  x: number;
  y: number;
  h: number;
  cols: DbTable["columns"];
  more: number;
}
export interface ErEdge {
  from: string;
  to: string;
  fromCol: number;
  toCol: number;
  label: string;
}

export function erLayout(schemas: DbSchema[], max = 150): { nodes: ErNode[]; edges: ErEdge[]; width: number; height: number; clipped: number } {
  const all = schemas.flatMap((s) => s.tables.filter((t) => t.kind === "table" || t.kind === "view").map((t) => ({ schema: s.name, t, key: `${s.name}.${t.name}` })));
  const list = all.slice(0, max);
  const byKey = new Map(list.map((x) => [x.key, x]));
  const resolve = (schema: string, ref: string, refSchema: string | null) => byKey.get(`${refSchema ?? schema}.${ref}`)?.key ?? list.find((x) => x.t.name === ref)?.key;
  const parents = new Map<string, string[]>();
  for (const x of list) parents.set(x.key, [...new Set(x.t.fks.map((f) => resolve(x.schema, f.refTable, f.refSchema)).filter((k): k is string => !!k && k !== x.key))]);

  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const lv = (k: string): number => {
    if (level.has(k)) return level.get(k)!;
    if (visiting.has(k)) return 0;
    visiting.add(k);
    const ps = parents.get(k) ?? [];
    const v = ps.length ? 1 + Math.max(...ps.map(lv)) : 0;
    visiting.delete(k);
    level.set(k, v);
    return v;
  };
  for (const x of list) lv(x.key);
  // Tabel tanpa relasi dikumpulkan di lapis terakhir supaya tidak memenuhi lapis induk.
  const related = new Set<string>();
  for (const [k, ps] of parents) if (ps.length) [k, ...ps].forEach((x) => related.add(x));
  const maxLevel = Math.max(0, ...[...level.values()]);
  const loneLevel = related.size ? maxLevel + 1 : 0;

  const layers: string[][] = [];
  for (const x of list) {
    const l = related.has(x.key) || !related.size ? level.get(x.key)! : loneLevel;
    (layers[l] ??= []).push(x.key);
  }
  const pos = new Map<string, number>();
  const nodes: ErNode[] = [];
  let height = 0;
  layers.forEach((keys, li) => {
    if (!keys) return;
    if (li > 0) {
      const bary = (k: string) => {
        const ps = (parents.get(k) ?? []).map((p) => pos.get(p)).filter((v): v is number => v !== undefined);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.MAX_SAFE_INTEGER;
      };
      keys.sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
    } else keys.sort();
    let y = ER.pad;
    keys.forEach((k, i) => {
      const x = byKey.get(k)!;
      const cols = x.t.columns.slice(0, ER.maxCols);
      const more = x.t.columns.length - cols.length;
      const h = ER.head + (cols.length + (more > 0 ? 1 : 0)) * ER.row + 8;
      nodes.push({ key: k, schema: x.schema, table: x.t, x: ER.pad + li * (ER.w + ER.gapX), y, h, cols, more });
      pos.set(k, i);
      y += h + ER.gapY;
    });
    height = Math.max(height, y);
  });
  const nodeOf = new Map(nodes.map((n) => [n.key, n]));
  const edges: ErEdge[] = [];
  for (const n of nodes) {
    for (const f of n.table.fks) {
      const to = resolve(n.schema, f.refTable, f.refSchema);
      if (!to || !nodeOf.has(to)) continue;
      const target = nodeOf.get(to)!;
      const fromCol = Math.max(0, n.cols.findIndex((c) => c.name === f.columns[0]));
      const toCol = Math.max(0, target.cols.findIndex((c) => c.name === f.refColumns[0]));
      edges.push({ from: n.key, to, fromCol, toCol, label: `${f.columns.join(",")} → ${f.refTable}.${f.refColumns.join(",")}` });
    }
  }
  const width = ER.pad * 2 + layers.length * (ER.w + ER.gapX) - ER.gapX;
  return { nodes, edges, width: Math.max(width, ER.w + ER.pad * 2), height: height + ER.pad, clipped: all.length - list.length };
}
