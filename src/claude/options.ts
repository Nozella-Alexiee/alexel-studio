// Pilihan mode izin, model, dan effort untuk panel Claude (label tampilan).

import type { ClaudeModel, ClaudePermMode } from "../lib/types";
import { tl } from "../i18n";

export const PERM_MODES: { id: ClaudePermMode; label: string; hint: string }[] = [
  { id: "default", label: tl("Tanya dulu"), hint: tl("Claude meminta izin di panel sebelum mengedit berkas atau menjalankan perintah.") },
  { id: "acceptEdits", label: tl("Edit otomatis"), hint: tl("Edit berkas langsung diterapkan. Perintah shell tetap ditanyakan dulu.") },
  { id: "plan", label: tl("Rencana"), hint: tl("Claude hanya membaca dan menyusun rencana, tanpa mengubah apa pun.") },
];

/** Dipakai sebelum CLI melaporkan daftar modelnya sendiri. */
export const FALLBACK_MODELS: ClaudeModel[] = [
  { value: "default", displayName: "Bawaan", description: tl("Model bawaan akunmu") },
  { value: "opus", displayName: "Opus", description: tl("Untuk tugas sehari-hari yang rumit") },
  { value: "sonnet", displayName: "Sonnet", description: tl("Efisien untuk tugas rutin") },
  { value: "haiku", displayName: "Haiku", description: tl("Paling cepat untuk jawaban singkat") },
  { value: "fable", displayName: "Fable", description: tl("Paling mampu untuk tugas terberat") },
];

export const EFFORTS: { id: string; label: string }[] = [
  { id: "auto", label: tl("Otomatis") },
  { id: "low", label: tl("Rendah") },
  { id: "medium", label: tl("Sedang") },
  { id: "high", label: tl("Tinggi") },
  { id: "xhigh", label: tl("Sangat tinggi") },
  { id: "max", label: tl("Maksimal") },
  { id: "ultra", label: "Ultra" },
];

/** Hanya alias (bukan id bertanggal) yang ditawarkan di pemilih; "default" selalu di depan. */
export function modelChoices(fromCli: ClaudeModel[]): ClaudeModel[] {
  const list = fromCli.length ? fromCli.filter((m) => m.value === "default" || /^[a-z]+(\[1m\])?$/.test(m.value)) : FALLBACK_MODELS;
  return list.map((m) => (m.value === "default" ? { ...m, displayName: "Bawaan", description: m.description } : m));
}

export const modeLabel = (id: string) => PERM_MODES.find((m) => m.id === id)?.label ?? id;
export const effortLabel = (id: string) => EFFORTS.find((e) => e.id === id)?.label ?? id;
