// Proses anak: mengekstrak isi `extension/` dari vsix besar (ratusan MB) tanpa membekukan aplikasi.
// Dipanggil: node extractor.cjs <vsix> <tujuan>. Hasil (jumlah berkas atau galat) lewat IPC.

import fs from "node:fs";
import { extractCode } from "./extensions";

const [, , vsix, dest] = process.argv;
// Keluar hanya setelah pesan terkirim: exit langsung bisa mendahului pesan dan induk melaporkan "berhenti tiba-tiba".
const done = (m: { ok: boolean; files?: number; error?: string }) => {
  if (process.send) process.send(m, () => process.exit(0));
  else process.exit(0);
};
try {
  done({ ok: true, files: extractCode(new Uint8Array(fs.readFileSync(vsix)), dest) });
} catch (e) {
  done({ ok: false, error: e instanceof Error ? e.message : String(e) });
}
