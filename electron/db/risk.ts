// Deteksi query berisiko yang butuh konfirmasi, dan query yang menulis (diblok di mode read-only).
// Dipakai main process (penegakan) dan renderer (dialog) supaya aturannya satu.

/** Buang komentar & isi string supaya kata kunci di dalamnya tidak terhitung. */
export function stripSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/`[^`]*`/g, "``");
}

/** Pecah skrip SQL jadi statement (titik koma di luar string/komentar). */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (!q && c === "-" && n === "-") {
      const e = sql.indexOf("\n", i);
      const end = e < 0 ? sql.length : e;
      cur += sql.slice(i, end);
      i = end - 1;
      continue;
    }
    if (!q && c === "/" && n === "*") {
      const e = sql.indexOf("*/", i + 2);
      const end = e < 0 ? sql.length : e + 2;
      cur += sql.slice(i, end);
      i = end - 1;
      continue;
    }
    if (q) {
      if (c === q) q = null;
    } else if (c === "'" || c === '"' || c === "`") q = c;
    if (c === ";" && !q) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Alasan query perlu konfirmasi, atau null. */
export function riskOf(sql: string): string | null {
  for (const st of splitStatements(sql)) {
    const s = stripSql(st).trim().toUpperCase().replace(/\s+/g, " ");
    if (/^DROP\b/.test(s)) return "DROP menghapus objek database secara permanen.";
    if (/^TRUNCATE\b/.test(s)) return "TRUNCATE menghapus semua baris tabel.";
    if (/^ALTER\b/.test(s)) return "ALTER mengubah struktur tabel.";
    if (/^(GRANT|REVOKE)\b/.test(s)) return "Perintah ini mengubah hak akses.";
    if (/^DELETE\b/.test(s) && !/\bWHERE\b/.test(s)) return "DELETE tanpa WHERE menghapus semua baris.";
    if (/^UPDATE\b/.test(s) && !/\bWHERE\b/.test(s)) return "UPDATE tanpa WHERE mengubah semua baris.";
  }
  return null;
}

/** Query mengubah data/struktur (bukan baca saja). */
export function isWrite(sql: string): boolean {
  return splitStatements(sql).some((st) => {
    const s = stripSql(st).trim().toUpperCase();
    if (/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|PRAGMA TABLE_INFO|VALUES|TABLE)\b/.test(s)) return false;
    if (/^WITH\b/.test(s)) return /\b(INSERT|UPDATE|DELETE|MERGE)\b/.test(s);
    return true;
  });
}

/** Statement pertama adalah query baca (hasilnya tabel). */
export const isReadQuery = (sql: string) => !isWrite(sql);
