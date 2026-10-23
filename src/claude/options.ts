// Pilihan mode izin, model, dan effort untuk panel Claude (label tampilan).

import type { ClaudeInfo, ClaudeModel, ClaudePermMode } from "../lib/types";
import { CLAUDE_BYPASS_MODE } from "../agents/registry";
import { tl } from "../i18n";

export const PERM_MODES: { id: ClaudePermMode; label: string; hint: string }[] = [
  { id: "default", label: tl("Tanya dulu"), hint: tl("Claude meminta izin di panel sebelum mengedit berkas atau menjalankan perintah.") },
  { id: "acceptEdits", label: tl("Edit otomatis"), hint: tl("Edit berkas langsung diterapkan. Perintah shell tetap ditanyakan dulu.") },
  { id: "plan", label: tl("Rencana"), hint: tl("Claude hanya membaca dan menyusun rencana, tanpa mengubah apa pun.") },
  { id: "auto", label: tl("Otomatis"), hint: tl("Claude memutuskan sendiri mana yang aman dijalankan tanpa bertanya; yang berisiko tetap ditanyakan.") },
];

/** Dipakai sebelum CLI melaporkan daftar modelnya sendiri. */
export const FALLBACK_MODELS: ClaudeModel[] = [
  { value: "default", displayName: tl("Bawaan"), description: tl("Model bawaan akunmu") },
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
  // Hanya Codex: tidak pernah ditawarkan untuk Claude (CLI hanya menerima low…max).
  { id: "none", label: tl("Tanpa") },
  { id: "minimal", label: tl("Minimal") },
  { id: "ultra", label: "Ultra" },
  { id: "persistent", label: tl("Gigih") },
];

/** Effort yang ditawarkan Claude bila CLI tidak menyebut daftar per model (sama dengan ekstensi resmi). */
export const CLAUDE_DEFAULT_EFFORTS = ["low", "medium", "high"];

/** Model yang sedang dipilih (nilai "default" → entri bawaan dari CLI). */
export function selectedModel(models: ClaudeModel[], value: string): ClaudeModel | undefined {
  return models.find((m) => m.value === value) ?? models.find((m) => m.value === "default");
}

/**
 * Effort yang boleh dipilih untuk model ini; null = model tidak punya pengaturan effort (kontrol disembunyikan).
 * Tidak pernah memuat nilai di luar yang didukung model, jadi tidak ada pilihan yang diam-diam dibuang CLI.
 */
export function claudeEffortLevels(m: ClaudeModel | undefined, cliEfforts?: string[]): string[] | null {
  if (m?.supportsEffort === false) return null;
  const levels = m?.supportedEffortLevels ?? CLAUDE_DEFAULT_EFFORTS;
  return cliEfforts?.length ? levels.filter((l) => cliEfforts.includes(l)) : levels;
}

/** Mode izin Claude yang tersedia: dibatasi pilihan CLI, kemampuan model (auto), dan izin mode berbahaya. */
export function claudeModesAvailable(info: ClaudeInfo | null | undefined, m: ClaudeModel | undefined, allowDangerous: boolean) {
  const cli = info?.permissionModes;
  const out = PERM_MODES.filter((x) => {
    if (x.id === "auto") return m?.supportsAutoMode === true && (!cli?.length || cli.includes("auto"));
    if (x.id === "default") return !cli?.length || cli.includes("default") || cli.includes("manual");
    return !cli?.length || cli.includes(x.id);
  });
  if (allowDangerous && (!cli?.length || cli.includes("bypassPermissions"))) out.push(CLAUDE_BYPASS_MODE);
  return out;
}

/** Hanya alias (bukan id bertanggal) yang ditawarkan di pemilih; "default" selalu di depan. */
export function modelChoices(fromCli: ClaudeModel[]): ClaudeModel[] {
  const list = fromCli.length ? fromCli.filter((m) => m.value === "default" || /^[a-z]+(\[1m\])?$/.test(m.value)) : FALLBACK_MODELS;
  return list.map((m) => (m.value === "default" ? { ...m, displayName: tl("Bawaan"), description: m.description } : m));
}

export const modeLabel = (id: string) => PERM_MODES.find((m) => m.id === id)?.label ?? id;
export const effortLabel = (id: string) => EFFORTS.find((e) => e.id === id)?.label ?? id;
