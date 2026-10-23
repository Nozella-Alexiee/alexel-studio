// Pasang / perbarui / hapus ekstensi dari panel maupun halaman detail.

import * as A from "../app/actions";
import { call, errMsg } from "../lib/ipc";
import { confirmDialog, getState, toast } from "../state/store";
import { installAgent, agentForPackage } from "../panels/AgentExtensions";
import { tl } from "../i18n";
import { loadExtensions, type InstalledExt } from "./registry";

/** Pasang ekstensi; `quiet` (pembaruan) tidak menawarkan tema lagi. Mengembalikan manifest atau null bila gagal. */
export async function installExtension(namespace: string, name: string, opts: { version?: string; quiet?: boolean } = {}): Promise<InstalledExt | null> {
  // Ekstensi agen (Claude Code, Codex): pasang biner agennya ke panel Agen AI.
  const agent = agentForPackage(namespace, name);
  if (agent) {
    await installAgent(agent);
    return null;
  }
  try {
    const m = await call<InstalledExt>("ext_install", { namespace, name, version: opts.version ?? null });
    await loadExtensions();
    toast(tl("{name} terpasang", { name: m.displayName }), "success");
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
