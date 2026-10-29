// Bantuan teks query: statement di posisi kursor (SQL: dipisah `;`; Mongo/Redis: dipisah baris kosong),
// dan bahasa editor + autocomplete skema untuk tiap jenis database.

import type { Extension } from "@codemirror/state";
import type { DbKind, DbSchema } from "../../electron/db/types";
import { completionSchema } from "./state";

/** Rentang statement SQL (titik koma di luar string/komentar). */
export function sqlRanges(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = 0;
  let q: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (!q && c === "-" && n === "-") {
      const e = text.indexOf("\n", i);
      i = e < 0 ? text.length : e;
      continue;
    }
    if (!q && c === "/" && n === "*") {
      const e = text.indexOf("*/", i + 2);
      i = e < 0 ? text.length : e + 1;
      continue;
    }
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") q = c;
    else if (c === ";") {
      out.push({ from: start, to: i + 1 });
      start = i + 1;
    }
  }
  out.push({ from: start, to: text.length });
  return out.filter((r) => text.slice(r.from, r.to).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/;/g, "").trim());
}

/** Blok dipisah baris kosong (Mongo/Redis). */
function blockRanges(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const re = /\n\s*\n/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ from: start, to: m.index });
    start = m.index + m[0].length;
  }
  out.push({ from: start, to: text.length });
  return out.filter((r) => text.slice(r.from, r.to).trim());
}

/** Teks yang dijalankan "Run": seleksi, atau statement/blok di kursor. */
export function statementAt(text: string, pos: number, kind: DbKind): string {
  const ranges = kind === "mongodb" || kind === "redis" ? blockRanges(text) : sqlRanges(text);
  const hit = ranges.find((r) => pos >= r.from && pos <= r.to) ?? ranges.filter((r) => r.to <= pos).pop() ?? ranges[0];
  return hit ? text.slice(hit.from, hit.to).trim().replace(/;\s*$/, "") : "";
}

/** Bahasa editor + autocomplete untuk jenis database. */
export async function queryLanguage(kind: DbKind, schema?: DbSchema[]): Promise<Extension> {
  if (kind === "mongodb") return (await import("@codemirror/lang-javascript")).javascript();
  if (kind === "redis") return [];
  const m = await import("@codemirror/lang-sql");
  const dialect = kind === "postgres" ? m.PostgreSQL : kind === "mysql" ? m.MySQL : m.SQLite;
  const defaultSchema = kind === "postgres" ? "public" : undefined;
  return m.sql({ dialect, schema: completionSchema(schema, kind), defaultSchema, upperCaseKeywords: true });
}

/**
 * Autocomplete skema untuk berkas .sql. Bahasa dokumen tetap SQL standar dari editor; sumber
 * completion dipasang pada bahasa itu (dialek lain = objek bahasa lain, datanya tidak terbaca).
 */
export async function fileSchemaCompletion(kind: DbKind, schema?: DbSchema[]): Promise<Extension> {
  const m = await import("@codemirror/lang-sql");
  const dialect = kind === "postgres" ? m.PostgreSQL : kind === "mysql" ? m.MySQL : m.SQLite;
  return m.StandardSQL.language.data.of({ autocomplete: m.schemaCompletionSource({ dialect, schema: completionSchema(schema, kind), defaultSchema: kind === "postgres" ? "public" : undefined }) });
}

/** Berkas yang dianggap berkas query database. */
export const isQueryFile = (path: string) => /\.(sql|psql|pgsql|mysql|sqlite|mongodb|mongo|redis)$/i.test(path);
export const kindHint = (path: string): DbKind | null => (/\.(mongodb|mongo)$/i.test(path) ? "mongodb" : /\.redis$/i.test(path) ? "redis" : null);
