// Tipe bersama klien database (main process & renderer).

export type DbKind = "postgres" | "mysql" | "sqlite" | "mongodb" | "redis";

export interface DbConnection {
  id: string;
  name: string;
  kind: DbKind;
  /** URL koneksi tanpa password (password disimpan terpisah, terenkripsi). */
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  /** Berkas SQLite. */
  file?: string;
  ssl?: boolean;
  readOnly?: boolean;
  /** Tanda lingkungan: produksi ditandai merah di UI. */
  env?: "dev" | "staging" | "prod";
  /** Ada password tersimpan (nilainya tidak pernah dikirim ke renderer). */
  hasPassword?: boolean;
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
  default?: string | null;
}

export interface DbForeignKey {
  columns: string[];
  refSchema: string | null;
  refTable: string;
  refColumns: string[];
}

export interface DbTable {
  name: string;
  kind: "table" | "view" | "collection" | "key";
  columns: DbColumn[];
  fks: DbForeignKey[];
  /** Redis: tipe key; Mongo: jumlah dokumen perkiraan. */
  detail?: string;
}

export interface DbSchema {
  name: string;
  tables: DbTable[];
}

export interface QueryResult {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  /** Baris yang terpengaruh (INSERT/UPDATE/DELETE). */
  affected?: number | null;
  /** Hasil dipotong pada batas baris. */
  truncated: boolean;
  ms: number;
  /** Pesan untuk perintah tanpa hasil tabel (mis. "OK", "CREATE TABLE"). */
  message?: string;
}

export interface QueryOptions {
  limit?: number;
  timeoutMs?: number;
  /** Pemakai sudah mengonfirmasi query berisiko (DROP, DELETE tanpa WHERE, …). */
  confirmed?: boolean;
}
