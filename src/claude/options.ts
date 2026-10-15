// Pilihan mode izin, model, dan effort untuk panel Claude (label tampilan).

import type { ClaudeModel, ClaudePermMode } from "../lib/types";

export const PERM_MODES: { id: ClaudePermMode; label: string; hint: string }[] = [
  { id: "default", label: "Tanya dulu", hint: "Claude meminta izin di panel sebelum mengedit berkas atau menjalankan perintah." },
  { id: "acceptEdits", label: "Edit otomatis", hint: "Edit berkas langsung diterapkan. Perintah shell tetap ditanyakan dulu." },
  { id: "plan", label: "Rencana", hint: "Claude hanya membaca dan menyusun rencana, tanpa mengubah apa pun." },
];

/** Dipakai sebelum CLI melaporkan daftar modelnya sendiri. */
export const FALLBACK_MODELS: ClaudeModel[] = [
  { value: "default", displayName: "Bawaan", description: "Model bawaan akunmu" },
  { value: "opus", displayName: "Opus", description: "Untuk tugas sehari-hari yang rumit" },
  { value: "sonnet", displayName: "Sonnet", description: "Efisien untuk tugas rutin" },
  { value: "haiku", displayName: "Haiku", description: "Paling cepat untuk jawaban singkat" },
  { value: "fable", displayName: "Fable", description: "Paling mampu untuk tugas terberat" },
];

export const EFFORTS: { id: string; label: string }[] = [
  { id: "auto", label: "Otomatis" },
  { id: "low", label: "Rendah" },
  { id: "medium", label: "Sedang" },
  { id: "high", label: "Tinggi" },
  { id: "xhigh", label: "Sangat tinggi" },
  { id: "max", label: "Maksimal" },
];

/** Hanya alias (bukan id bertanggal) yang ditawarkan di pemilih; "default" selalu di depan. */
export function modelChoices(fromCli: ClaudeModel[]): ClaudeModel[] {
  const list = fromCli.length ? fromCli.filter((m) => m.value === "default" || /^[a-z]+(\[1m\])?$/.test(m.value)) : FALLBACK_MODELS;
  return list.map((m) => (m.value === "default" ? { ...m, displayName: "Bawaan", description: m.description } : m));
}

export const modeLabel = (id: string) => PERM_MODES.find((m) => m.id === id)?.label ?? id;
export const effortLabel = (id: string) => EFFORTS.find((e) => e.id === id)?.label ?? id;
