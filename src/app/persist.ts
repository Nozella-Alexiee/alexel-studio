// Simpan & pulihkan pengaturan dan sesi (folder, tab, layout per desain).

import { applyDesign, DESIGNS } from "../design/designs";
import { api } from "../lib/ipc";
import { DEFAULT_LAYOUTS, DEFAULT_SETTINGS, getState, setState, type Group, type Layout, type Settings } from "../state/store";

interface SessionFile {
  v: 1;
  root: string | null;
  groups: Group[];
  focused: number;
  layouts: Record<string, Layout>;
}

let sessionTimer = 0;
let settingsTimer = 0;
let restoring = true;

export function persistSession() {
  if (restoring) return;
  clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(() => {
    const s = getState();
    const file: SessionFile = {
      v: 1,
      root: s.root,
      groups: s.groups.map((g) => ({ tabs: g.tabs.filter((t) => s.tabs[t]?.kind === "text" || s.tabs[t]?.kind === "image" || t === "nozel:settings"), active: g.active })),
      focused: s.focusedGroup,
      layouts: s.layouts,
    };
    void api.storeSave("session", JSON.stringify(file)).catch(() => {});
  }, 500);
}

export function persistSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(() => {
    void api.storeSave("settings", JSON.stringify(getState().settings)).catch(() => {});
  }, 300);
}

function parse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function sanitizeSettings(raw: Partial<Settings> | null): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if (!DESIGNS.some((d) => d.id === s.design)) s.design = DEFAULT_SETTINGS.design;
  s.fontSize = Math.min(28, Math.max(9, Number(s.fontSize) || 13));
  s.tabSize = [2, 4, 8].includes(Number(s.tabSize)) ? Number(s.tabSize) : 2;
  s.terminalFontSize = Math.min(24, Math.max(9, Number(s.terminalFontSize) || 12));
  if (s.claudeMode !== "edit") s.claudeMode = "read";
  if (s.claudeInlineModel !== "default") s.claudeInlineModel = "fast";
  return s;
}

/** Dipanggil sekali saat aplikasi mulai. */
export async function restoreAll() {
  const [settingsRaw, sessionRaw, recentsRaw] = await Promise.all([
    api.storeLoad("settings").catch(() => null),
    api.storeLoad("session").catch(() => null),
    api.storeLoad("recents").catch(() => null),
  ]);
  const settings = sanitizeSettings(parse<Partial<Settings>>(settingsRaw));
  const session = parse<SessionFile>(sessionRaw);
  const recents = parse<string[]>(recentsRaw)?.filter((r) => typeof r === "string") ?? [];
  const layouts = { ...DEFAULT_LAYOUTS };
  if (session?.layouts) {
    for (const k of Object.keys(DEFAULT_LAYOUTS) as (keyof typeof DEFAULT_LAYOUTS)[]) {
      if (session.layouts[k]) layouts[k] = { ...DEFAULT_LAYOUTS[k], ...session.layouts[k] };
    }
  }
  setState({ settings, layouts, recents });
  applyDesign(settings.design, settings.accent);
  void import("./actions").then((m) => m.syncTrafficLights());

  if (session?.root) {
    const { openProject } = await import("./actions");
    try {
      await openProject(session.root, { restoreTabs: { groups: session.groups ?? [], focused: session.focused ?? 0 } });
    } catch {
      /* folder sudah tidak ada */
    }
  }
  restoring = false;
  setState({ ready: true });
}
