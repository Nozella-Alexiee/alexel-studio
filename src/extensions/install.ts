// Pasang / perbarui / hapus ekstensi dari panel maupun halaman detail.

import * as A from "../app/actions";
import { call, errMsg } from "../lib/ipc";
import { confirmDialog, getState, toast } from "../state/store";
import { serverStatus } from "../editor/lsp";
import { installServer } from "./servers";
import { tl } from "../i18n";
import { loadExtensions, type InstalledExt } from "./registry";

/** Pasang ekstensi; `quiet` (pembaruan) tidak menawarkan tema lagi. Mengembalikan manifest atau null bila gagal. */
export async function installExtension(namespace: string, name: string, opts: { version?: string; quiet?: boolean } = {}): Promise<InstalledExt | null> {
  try {
    const m = await call<InstalledExt>("ext_install", { namespace, name, version: opts.version ?? null });
    await loadExtensions();
    toast(tl("{name} terpasang", { name: m.displayName }), "success");
    // Ekstensi yang punya server bahasa terkurasi: tawarkan server-nya (konfirmasi eksplisit).
    const srv = (await serverStatus()).find((s) => s.managed && !s.available && s.extensionIds?.some((e) => e.toLowerCase() === m.id.toLowerCase()));
    if (srv && !opts.quiet) await installServer(srv);
    if (m.hasCode && !getState().settings.trustedExts.includes(m.id)) await trustExtension(m);
    if (opts.quiet) return m;
    if (m.themes[0] && (await confirmDialog(tl("Pakai tema {name}?", { name: m.themes[0].label }), tl("Warnanya diterapkan di atas desain yang sedang dipakai. Tata letak dan Nozi tetap."), tl("Pakai")))) {
      A.updateSettings({ extTheme: { ext: m.id, path: m.themes[0].path, label: m.themes[0].label, uiTheme: m.themes[0].uiTheme } });
    }
    if (m.iconThemes[0] && (await confirmDialog(tl("Pakai tema ikon {name}?", { name: m.iconThemes[0].label }), tl("Ikon berkas & folder di Explorer, tab, dan pencarian ikut berganti."), tl("Pakai")))) {
      A.updateSettings({ iconTheme: { ext: m.id, path: m.iconThemes[0].path, label: m.iconThemes[0].label } });
    }
    return m;
  } catch (e) {
    toast(errMsg(e), "error");
    return null;
  }
}

/** Izinkan kode ekstensi berjalan di extension host (konfirmasi eksplisit, per ekstensi). */
export async function trustExtension(ext: Pick<InstalledExt, "id" | "displayName" | "publisher">): Promise<boolean> {
  const ok = await confirmDialog(
    tl("Jalankan kode {name}?", { name: ext.displayName }),
    tl("Ekstensi ini berisi kode JavaScript dari penerbit \"{publisher}\". Kode itu berjalan di komputermu dengan izin yang sama seperti Alexel Studio: bisa membaca dan menulis berkas serta memakai jaringan. Hanya percayai penerbit yang kamu kenal. Tanpa izin, hanya tema, snippet, dan grammar-nya yang dipakai.", { publisher: ext.publisher ?? "?" }),
    tl("Percayai & jalankan"),
    false,
  );
  if (!ok) return false;
  const s = getState().settings;
  if (!s.trustedExts.includes(ext.id)) A.updateSettings({ trustedExts: [...s.trustedExts, ext.id] });
  return true;
}

export function revokeTrust(id: string) {
  const s = getState().settings;
  A.updateSettings({ trustedExts: s.trustedExts.filter((x) => x !== id) });
}

export async function removeExtension(ext: InstalledExt): Promise<boolean> {
  const s = getState().settings;
  if (!(await confirmDialog(tl("Hapus {name}?", { name: ext.displayName }), tl("Tema, tema ikon, snippet, dan grammar dari ekstensi ini tidak dipakai lagi."), tl("Hapus"), true))) return false;
  if (s.extTheme?.ext === ext.id) A.updateSettings({ extTheme: null });
  if (s.iconTheme?.ext === ext.id) A.updateSettings({ iconTheme: null });
  if (s.disabledExts.includes(ext.id)) A.updateSettings({ disabledExts: s.disabledExts.filter((x) => x !== ext.id) });
  try {
    await call("ext_remove", { id: ext.id });
  } catch (e) {
    toast(errMsg(e), "error");
    return false;
  }
  await loadExtensions();
  return true;
}

export function setExtensionEnabled(id: string, enabled: boolean) {
  const cur = getState().settings.disabledExts;
  const next = enabled ? cur.filter((x) => x !== id) : cur.includes(id) ? cur : [...cur, id];
  A.updateSettings({ disabledExts: next });
}
