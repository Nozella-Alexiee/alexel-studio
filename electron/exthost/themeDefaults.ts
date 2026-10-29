// Ekstensi tema bawaan VS Code ("vscode.theme-defaults") untuk ekstensi yang mewarnai kode di panelnya
// sendiri (Continue, Cline, Kilo, …): mereka mencari tema aktif (`workbench.colorTheme`) di
// vscode.extensions.all lalu membaca berkas JSON-nya. Berkasnya ditulis sekali ke folder appRoot.

import fs from "node:fs";
import path from "node:path";

type Rule = { scope: string | string[]; settings: { foreground?: string; fontStyle?: string } };

// Warna token Dark Modern / Light Modern (setara Dark+ / Light+) untuk lingkup yang umum.
const DARK: Rule[] = [
  { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#6A9955" } },
  { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#CE9178" } },
  { scope: ["constant.numeric", "constant.language.boolean"], settings: { foreground: "#B5CEA8" } },
  { scope: ["constant.language", "variable.language"], settings: { foreground: "#569CD6" } },
  { scope: ["keyword", "storage.type", "storage.modifier", "keyword.operator.new", "keyword.operator.expression"], settings: { foreground: "#569CD6" } },
  { scope: ["keyword.control", "keyword.control.flow", "keyword.control.import", "keyword.control.export"], settings: { foreground: "#C586C0" } },
  { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#DCDCAA" } },
  { scope: ["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class"], settings: { foreground: "#4EC9B0" } },
  { scope: ["variable", "meta.definition.variable.name", "support.variable", "entity.name.variable"], settings: { foreground: "#9CDCFE" } },
  { scope: ["variable.other.constant", "variable.other.enummember"], settings: { foreground: "#4FC1FF" } },
  { scope: ["entity.name.tag"], settings: { foreground: "#569CD6" } },
  { scope: ["entity.other.attribute-name"], settings: { foreground: "#9CDCFE" } },
  { scope: ["support.type.property-name", "meta.object-literal.key"], settings: { foreground: "#9CDCFE" } },
  { scope: ["string.regexp"], settings: { foreground: "#D16969" } },
  { scope: ["markup.heading"], settings: { foreground: "#569CD6", fontStyle: "bold" } },
  { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
  { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
  { scope: ["markup.inserted"], settings: { foreground: "#B5CEA8" } },
  { scope: ["markup.deleted"], settings: { foreground: "#CE9178" } },
  { scope: ["invalid"], settings: { foreground: "#F44747" } },
];
const LIGHT: Rule[] = [
  { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#008000" } },
  { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#A31515" } },
  { scope: ["constant.numeric", "constant.language.boolean"], settings: { foreground: "#098658" } },
  { scope: ["constant.language", "variable.language"], settings: { foreground: "#0000FF" } },
  { scope: ["keyword", "storage.type", "storage.modifier", "keyword.operator.new", "keyword.operator.expression"], settings: { foreground: "#0000FF" } },
  { scope: ["keyword.control", "keyword.control.flow", "keyword.control.import", "keyword.control.export"], settings: { foreground: "#AF00DB" } },
  { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#795E26" } },
  { scope: ["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class"], settings: { foreground: "#267F99" } },
  { scope: ["variable", "meta.definition.variable.name", "support.variable", "entity.name.variable"], settings: { foreground: "#001080" } },
  { scope: ["variable.other.constant", "variable.other.enummember"], settings: { foreground: "#0070C1" } },
  { scope: ["entity.name.tag"], settings: { foreground: "#800000" } },
  { scope: ["entity.other.attribute-name"], settings: { foreground: "#E50000" } },
  { scope: ["support.type.property-name", "meta.object-literal.key"], settings: { foreground: "#0451A5" } },
  { scope: ["string.regexp"], settings: { foreground: "#811F3F" } },
  { scope: ["markup.heading"], settings: { foreground: "#800000", fontStyle: "bold" } },
  { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
  { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
  { scope: ["markup.inserted"], settings: { foreground: "#098658" } },
  { scope: ["markup.deleted"], settings: { foreground: "#A31515" } },
  { scope: ["invalid"], settings: { foreground: "#CD3131" } },
];

export const THEME_DEFAULTS_ID = "vscode.theme-defaults";

/** Tulis paket tema bawaan di `appRoot/extensions/theme-defaults` (sekali), kembalikan folder & manifest-nya. */
export function themeDefaults(appRoot: string): { dir: string; manifest: Record<string, unknown> } {
  const dir = path.join(appRoot, "extensions", "theme-defaults");
  const manifest = {
    name: "theme-defaults",
    publisher: "vscode",
    displayName: "Default Themes",
    version: "1.0.0",
    contributes: {
      themes: [
        { id: "Default Dark Modern", label: "Dark Modern", uiTheme: "vs-dark", path: "./themes/dark_modern.json" },
        { id: "Default Light Modern", label: "Light Modern", uiTheme: "vs", path: "./themes/light_modern.json" },
        { id: "Default Dark+", label: "Dark+", uiTheme: "vs-dark", path: "./themes/dark_modern.json" },
        { id: "Default Light+", label: "Light+", uiTheme: "vs", path: "./themes/light_modern.json" },
      ],
    },
  };
  try {
    fs.mkdirSync(path.join(dir, "themes"), { recursive: true });
    const w = (f: string, body: unknown) => {
      const p = path.join(dir, f);
      const text = JSON.stringify(body, null, 2);
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== text) fs.writeFileSync(p, text);
    };
    w("package.json", manifest);
    w("themes/dark_modern.json", { name: "Dark Modern", type: "dark", colors: { "editor.background": "#1F1F1F", "editor.foreground": "#CCCCCC" }, tokenColors: DARK });
    w("themes/light_modern.json", { name: "Light Modern", type: "light", colors: { "editor.background": "#FFFFFF", "editor.foreground": "#3B3B3B" }, tokenColors: LIGHT });
  } catch {
    /* folder tidak bisa ditulis: ekstensi memakai warna bawaan */
  }
  return { dir, manifest };
}
