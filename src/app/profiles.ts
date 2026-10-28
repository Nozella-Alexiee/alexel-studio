// Profil pengaturan (pengganti Settings Sync tanpa cloud): simpan pengaturan + shortcut sebagai profil
// bernama, ganti profil kapan saja, atau ekspor/impor ke berkas JSON (beserta daftar ekstensi) untuk
// dipakai di komputer lain.

import * as A from "./actions";
import { sanitizeSettings } from "./persist";
import { api, errMsg, pickFile, pickSavePath } from "../lib/ipc";
import { confirmDialog, getState, promptDialog, toast, type Settings } from "../state/store";
import { useExtensions } from "../extensions/registry";
import { tl } from "../i18n";

/** Pengaturan yang khas mesin ini / keamanan: tidak ikut profil. */
const LOCAL_ONLY: (keyof Settings)[] = ["trustedExts", "claudeConsent", "allowDangerousModes"];

export interface ProfileFile {
  format: "alexel-profile";
  version: 1;
  name: string;
  settings: Partial<Settings>;
  extensions: { id: string; version?: string }[];
}

function snapshot(): Partial<Settings> {
  const s = { ...getState().settings } as Partial<Settings>;
  for (const k of LOCAL_ONLY) delete s[k];
  return s;
}

/** Perubahan yang diterapkan profil di atas pengaturan `cur` (nilai dibersihkan; pengaturan lokal dilewati). */
export function profilePatch(cur: Settings, raw: Partial<Settings>): Partial<Settings> {
  const clean = sanitizeSettings({ ...cur, ...raw });
  const patch: Partial<Settings> = {};
  for (const k of Object.keys(clean) as (keyof Settings)[]) {
    if (LOCAL_ONLY.includes(k)) continue;
    if (JSON.stringify(clean[k]) !== JSON.stringify(cur[k])) (patch as Record<string, unknown>)[k] = clean[k];
  }
  return patch;
}

/** Terapkan pengaturan dari profil di atas pengaturan sekarang. */
export function applySettings(raw: Partial<Settings>) {
  A.updateSettings(profilePatch(getState().settings, raw));
}

export async function loadProfiles(): Promise<Record<string, Partial<Settings>>> {
  try {
    const raw = JSON.parse((await api.storeLoad("profiles")) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

async function saveProfiles(p: Record<string, Partial<Settings>>) {
  await api.storeSave("profiles", JSON.stringify(p));
}

export async function saveProfileAs(): Promise<string | null> {
  const name = await promptDialog(tl("Simpan sebagai profil"), { placeholder: tl("mis. Kerja, Presentasi"), validate: (v) => (v.trim().length > 0 && v.trim().length <= 40 ? null : tl("Nama 1–40 karakter.")) });
  if (!name) return null;
  const all = await loadProfiles();
  if (all[name] && !(await confirmDialog(tl("Timpa profil {name}?", { name }), tl("Pengaturan profil ini diganti dengan pengaturan sekarang."), tl("Timpa")))) return null;
  all[name] = snapshot();
  await saveProfiles(all);
  toast(tl("Profil {name} disimpan", { name }), "success");
  return name;
}

export async function applyProfile(name: string) {
  const p = (await loadProfiles())[name];
  if (!p) return;
  applySettings(p);
  toast(tl("Profil {name} dipakai", { name }), "success");
}

export async function deleteProfile(name: string) {
  if (!(await confirmDialog(tl("Hapus profil {name}?", { name }), tl("Pengaturan yang sedang dipakai tidak berubah."), tl("Hapus"), true))) return;
  const all = await loadProfiles();
  delete all[name];
  await saveProfiles(all);
}

export function profileFile(name: string): ProfileFile {
  return {
    format: "alexel-profile",
    version: 1,
    name,
    settings: snapshot(),
    extensions: useExtensions.getState().list.map((e) => ({ id: e.id, version: e.version })),
  };
}

/** Baca & periksa berkas profil; null bila bukan profil Alexel Studio. */
export function parseProfile(text: string): ProfileFile | null {
  try {
    const j = JSON.parse(text);
    if (j?.format !== "alexel-profile" || typeof j.settings !== "object" || !j.settings) return null;
    const exts = Array.isArray(j.extensions) ? j.extensions.filter((e: { id?: unknown }) => typeof e?.id === "string" && /^[\w-]+\.[\w.-]+$/.test(e.id)) : [];
    return { format: "alexel-profile", version: 1, name: typeof j.name === "string" ? j.name.slice(0, 40) : "Profil", settings: j.settings, extensions: exts };
  } catch {
    return null;
  }
}

export async function exportProfile() {
  const target = await pickSavePath("alexel-profile.json", [{ name: "Profil Alexel Studio", extensions: ["json"] }]);
  if (!target) return;
  try {
    await api.writeText(target, JSON.stringify(profileFile("Ekspor"), null, 2) + "\n");
    toast(tl("Profil diekspor"), "success");
  } catch (e) {
    toast(errMsg(e), "error");
  }
}

export async function importProfile() {
  const f = await pickFile([{ name: "Profil Alexel Studio", extensions: ["json"] }]);
  if (!f) return;
  try {
    const p = parseProfile((await api.readText(f)).content);
    if (!p) return toast(tl("Berkas ini bukan profil Alexel Studio."), "error");
    if (!(await confirmDialog(tl("Pakai profil {name}?", { name: p.name }), tl("Pengaturan dan shortcut diganti dengan isi profil. Izin ekstensi (percaya) tidak ikut diimpor."), tl("Pakai")))) return;
    applySettings(p.settings);
    const have = new Set(useExtensions.getState().list.map((e) => e.id.toLowerCase()));
    const missing = p.extensions.filter((e) => !have.has(e.id.toLowerCase()));
    if (missing.length && (await confirmDialog(tl("Pasang {n} ekstensi dari profil?", { n: missing.length }), missing.map((e) => e.id).join(", "), tl("Pasang")))) {
      const { installExtension } = await import("../extensions/install");
      for (const e of missing) {
        const dot = e.id.indexOf(".");
        await installExtension(e.id.slice(0, dot), e.id.slice(dot + 1), { quiet: true });
      }
    }
    toast(tl("Profil {name} dipakai", { name: p.name }), "success");
  } catch (e) {
    toast(errMsg(e), "error");
  }
}
