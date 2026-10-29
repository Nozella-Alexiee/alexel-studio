// Antarmuka driver database dan helper bersama (serialisasi nilai, kutip identifier).

import type { DbSchema, QueryResult } from "./types";

export interface Driver {
  /** Versi server (dipakai "Uji koneksi"). */
  version(): Promise<string>;
  schema(): Promise<DbSchema[]>;
  /** Jalankan teks query (bisa beberapa statement; hasil statement terakhir). */
  query(text: string, o: { limit: number; timeoutMs: number }): Promise<QueryResult>;
  /** Statement berparameter (dipakai edit sel / tambah / hapus baris). */
  exec(sql: string, params: unknown[]): Promise<{ affected: number }>;
  /** SELECT berparameter (halaman tabel); hanya driver SQL. */
  browse?(sql: string, params: unknown[]): Promise<QueryResult>;
  cancel(): Promise<void>;
  close(): Promise<void>;
}

/** Nilai dari driver → nilai yang aman dikirim lewat IPC & ditampilkan di grid. */
export function cell(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    const b = Buffer.from(v as Uint8Array);
    return b.length > 64 ? `\\x${b.subarray(0, 64).toString("hex")}… (${b.length} B)` : `\\x${b.toString("hex")}`;
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    } catch {
      return String(v);
    }
  }
  return v;
}

export const quoteIdent = (dialect: "postgres" | "mysql" | "sqlite", name: string) =>
  dialect === "mysql" ? `\`${name.replace(/`/g, "``")}\`` : `"${name.replace(/"/g, '""')}"`;

export const placeholder = (dialect: "postgres" | "mysql" | "sqlite", i: number) => (dialect === "postgres" ? `$${i + 1}` : "?");

/** Jalankan janji dengan batas waktu; `onTimeout` dipanggil (mis. batalkan query) sebelum gagal. */
export async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Promise<void> | void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_r, rej) => {
    timer = setTimeout(() => {
      void Promise.resolve(onTimeout()).catch(() => {});
      rej(new Error(`Query dihentikan: melewati batas waktu ${Math.round(ms / 1000)} detik.`));
    }, ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    clearTimeout(timer);
  }
}
