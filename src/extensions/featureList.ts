// Ringkasan `contributes` sebuah ekstensi untuk tab "Fitur" (seperti VS Code): perintah, pengaturan, tema, dst.

import { tl } from "../i18n";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FeatureRow {
  name: string;
  detail?: string;
}
export interface FeatureSection {
  id: string;
  title: string;
  rows: FeatureRow[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): Any[] => (Array.isArray(v) ? v : v ? [v] : []);

/** Kunci pengaturan + nilai bawaan + deskripsi dari contributes.configuration (objek atau larik blok). */
export function configProperties(contributes: Any): { key: string; type: string; def: unknown; desc: string; enum?: unknown[]; enumDescriptions?: string[]; title?: string }[] {
  const out: { key: string; type: string; def: unknown; desc: string; enum?: unknown[]; enumDescriptions?: string[]; title?: string }[] = [];
  for (const block of arr(contributes?.configuration)) {
    for (const [key, p] of Object.entries((block?.properties ?? {}) as Record<string, Any>)) {
      out.push({ key, type: Array.isArray(p?.type) ? String(p.type[0]) : str(p?.type) || "string", def: p?.default, desc: str(p?.markdownDescription) || str(p?.description), enum: Array.isArray(p?.enum) ? p.enum : undefined, enumDescriptions: p?.enumDescriptions, title: str(block?.title) || undefined });
    }
  }
  return out;
}

export function featureSections(c: Any, keybindingFor?: (cmd: string) => string | undefined): FeatureSection[] {
  if (!c || typeof c !== "object") return [];
  const out: FeatureSection[] = [];
  const add = (id: string, title: string, rows: FeatureRow[]) => rows.length && out.push({ id, title: `${title} (${rows.length})`, rows });
  add("commands", tl("Perintah"), arr(c.commands).filter((x) => str(x?.command)).map((x) => ({ name: [str(x.category), str(x.title)].filter(Boolean).join(": ") || x.command, detail: x.command })));
  add("settings", tl("Pengaturan"), configProperties(c).map((p) => ({ name: p.key, detail: p.desc || `${p.type}, ${tl("bawaan")}: ${JSON.stringify(p.def)}` })));
  add("keybindings", tl("Pintasan keyboard"), arr(c.keybindings).filter((x) => str(x?.command)).map((x) => ({ name: x.command, detail: [x.key, x.mac && `mac: ${x.mac}`, x.when && `when: ${x.when}`].filter(Boolean).join("  ") })));
  add("themes", tl("Tema warna"), arr(c.themes).map((x) => ({ name: str(x.label) || str(x.id) || "?", detail: str(x.uiTheme) })));
  add("iconThemes", tl("Tema ikon"), arr(c.iconThemes).map((x) => ({ name: str(x.label) || str(x.id) || "?" })));
  add("languages", tl("Bahasa"), arr(c.languages).map((x) => ({ name: str(x.aliases?.[0]) || str(x.id), detail: arr(x.extensions).join(" ") })));
  add("grammars", tl("Pewarnaan sintaks"), arr(c.grammars).map((x) => ({ name: str(x.scopeName), detail: str(x.language) })));
  add("snippets", "Snippet", arr(c.snippets).map((x) => ({ name: str(x.language), detail: str(x.path) })));
  const views: FeatureRow[] = [];
  for (const [container, list] of Object.entries((c.views ?? {}) as Record<string, Any>)) for (const v of arr(list)) views.push({ name: str(v.name) || str(v.id), detail: container });
  add("views", tl("Tampilan"), views);
  add("menus", tl("Menu"), Object.entries((c.menus ?? {}) as Record<string, Any>).map(([where, items]) => ({ name: where, detail: `${arr(items).length}` })));
  add("jsonValidation", tl("Validasi JSON"), arr(c.jsonValidation).map((x) => ({ name: str(x.fileMatch), detail: str(x.url) })));
  if (keybindingFor) for (const s of out) if (s.id === "commands") for (const r of s.rows) r.detail = [r.detail, keybindingFor(r.detail ?? "")].filter(Boolean).join("  ");
  return out;
}
