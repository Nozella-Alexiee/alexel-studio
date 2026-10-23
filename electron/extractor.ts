// Proses anak: mengekstrak isi `extension/` dari vsix besar (ratusan MB) tanpa membekukan aplikasi.
// Dipanggil: node extractor.cjs <vsix> <tujuan>. Hasil (jumlah berkas atau galat) lewat IPC.

import fs from "node:fs";
import { extractCode } from "./extensions";

const [, , vsix, dest] = process.argv;
try {
  const n = extractCode(new Uint8Array(fs.readFileSync(vsix)), dest);
  process.send?.({ ok: true, files: n });
} catch (e) {
  process.send?.({ ok: false, error: e instanceof Error ? e.message : String(e) });
}
process.exit(0);
