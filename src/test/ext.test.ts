import { describe, expect, it } from "vitest";
import { convertSnippetBody } from "../extensions/registry";
import { parseJsonc, resolveTheme, scopeColor, themeToVars } from "../extensions/theme";
import { styleFor } from "../extensions/textmate";

const THEME = {
  type: "dark",
  colors: { "editor.background": "#282a36", "editor.foreground": "#f8f8f2", focusBorder: "#bd93f9", "sideBar.background": "#21222c", "editor.selectionBackground": "#44475a" },
  tokenColors: [
    { scope: "keyword", settings: { foreground: "#ff79c6" } },
    { scope: "keyword.operator", settings: { foreground: "#ff79c5" } },
    { scope: ["string", "string.quoted"], settings: { foreground: "#f1fa8c" } },
    { scope: "comment", settings: { foreground: "#6272a4", fontStyle: "italic" } },
    { scope: "meta.function entity.name.function", settings: { foreground: "#50fa7b" } },
    { scope: "constant.numeric, constant.language", settings: { foreground: "#bd93f9" } },
  ],
};

describe("tema ekstensi", () => {
  it("parse JSON berkomentar & koma akhir", () => {
    expect(parseJsonc('{\n // komentar\n "a": "x // bukan komentar", /* blok */ "b": [1,2,],\n}')).toEqual({ a: "x // bukan komentar", b: [1, 2] });
  });
  it("pencocokan scope ala VS Code", () => {
    expect(scopeColor(THEME, "keyword.control")).toBe("#ff79c6");
    expect(scopeColor(THEME, "keyword.operator.assignment")).toBe("#ff79c5");
    expect(scopeColor(THEME, "entity.name.function")).toBe("#50fa7b");
    expect(scopeColor(THEME, "constant.language")).toBe("#bd93f9");
    expect(scopeColor(THEME, "variable")).toBeNull();
  });
  it("menghasilkan variabel desain Nozel", () => {
    const { vars, scheme } = themeToVars(THEME, "vs-dark");
    expect(scheme).toBe("dark");
    expect(vars["--ed-bg"]).toBe("#282a36");
    expect(vars["--accent"]).toBe("#bd93f9");
    expect(vars["--surface-1"]).toBe("#21222c");
    expect(vars["--syn-keyword"]).toBe("#ff79c6");
    expect(vars["--syn-comment"]).toBe("#6272a4");
    expect(vars["--syn-variable"]).toBe("#f8f8f2");
    expect(themeToVars({ colors: {} }, "vs").scheme).toBe("light");
  });
  it("include tema induk digabung", async () => {
    const files: Record<string, string> = {
      "themes/child.json": JSON.stringify({ include: "./base.json", colors: { "editor.background": "#000000" } }),
      "themes/base.json": JSON.stringify({ colors: { "editor.background": "#111111", "editor.foreground": "#eeeeee" }, tokenColors: [{ scope: "string", settings: { foreground: "#00ff00" } }] }),
    };
    const t = await resolveTheme(async (p) => files[p], "themes/child.json");
    expect(t.colors?.["editor.background"]).toBe("#000000");
    expect(t.colors?.["editor.foreground"]).toBe("#eeeeee");
    expect(scopeColor(t, "string")).toBe("#00ff00");
  });
});

describe("snippet & grammar", () => {
  it("konversi body snippet VS Code", () => {
    expect(convertSnippetBody(["const ${1:name} = $2;", "$0"])).toBe("const ${1:name} = ${2};\n${0}");
    expect(convertSnippetBody("${1|let,const|} x")).toBe("${1:let} x");
    expect(convertSnippetBody("// ${TM_FILENAME}")).toBe("// ");
  });
  it("scope TextMate → gaya token", () => {
    expect(styleFor(["source.svelte", "comment.block"])).toBe("comment");
    expect(styleFor(["source.x", "string.quoted.double"])).toBe("string");
    expect(styleFor(["source.x", "keyword.control.flow"])).toBe("keyword");
    expect(styleFor(["source.x", "entity.name.function"])).toBe("def");
    expect(styleFor(["source.x"])).toBeNull();
    expect(styleFor(["source.js", "comment.line.double-slash.js", "punctuation.definition.comment.js"])).toBe("comment");
    expect(styleFor(["source.js", "string.quoted.double.js", "punctuation.definition.string.begin.js"])).toBe("string");
    expect(styleFor(["source.js", "meta.brace.round.js", "punctuation.section.js"])).toBe("bracket");
  });
});

describe("tema ekstensi tidak bocor dari desain", () => {
  it("warna yang tidak diisi tema diturunkan dari warna tema", () => {
    const { vars } = themeToVars({ type: "dark", colors: { "editor.background": "#101010", "editor.foreground": "#eeeeee" } }, "vs-dark");
    for (const k of ["--ed-active-line", "--border", "--fg-muted", "--glass", "--scrim", "--shadow-pop", "--minimap-fg", "--ansi-red", "--syn-keyword", "--syn-comment", "--git-untracked"]) {
      expect(vars[k], k).toBeTruthy();
    }
    expect(vars["--ed-active-line"]).toContain("#eeeeee");
    expect(vars["--syn-keyword"]).toBe("#eeeeee");
  });
});

describe("tema ikon berkas", () => {
  it("mencari ikon: nama → ekstensi majemuk → bahasa → default, plus varian terang", async () => {
    const { resolveIconTheme, iconIdFor } = await import("../extensions/icons");
    const t = resolveIconTheme(
      {
        iconDefinitions: { file: { iconPath: "./../icons/file.svg" }, ts: { iconPath: "../icons/ts.svg" }, test: { iconPath: "../icons/test.svg" }, pkg: { iconPath: "../icons/npm.svg" }, src: { iconPath: "../icons/src.svg" }, srcOpen: { iconPath: "../icons/src-open.svg" }, folder: { iconPath: "../icons/f.svg" }, tsLight: { iconPath: "../icons/ts_light.svg" } },
        file: "file",
        folder: "folder",
        fileNames: { "Package.json": "pkg" },
        fileExtensions: { "test.ts": "test" },
        languageIds: { typescript: "ts" },
        folderNames: { src: "src" },
        folderNamesExpanded: { src: "srcOpen" },
        light: { languageIds: { typescript: "tsLight" } },
      },
      "PKief.material-icon-theme",
      "dist/material-icons.json"
    );
    expect(iconIdFor(t.dark, "package.json", "file")).toBe("pkg");
    expect(iconIdFor(t.dark, "a.test.ts", "file")).toBe("test");
    expect(iconIdFor(t.dark, "main.ts", "file")).toBe("ts");
    expect(iconIdFor(t.light, "main.ts", "file")).toBe("tsLight");
    expect(iconIdFor(t.dark, "README", "file")).toBe("file");
    expect(iconIdFor(t.dark, "src", "folder", true)).toBe("srcOpen");
    expect(iconIdFor(t.dark, "lib", "folder")).toBe("folder");
    expect(t.urls.get("ts")).toBe("nozelext://icons/PKief.material-icon-theme/icons/ts.svg");
  });
});

import { configProperties, featureSections } from "../extensions/featureList";

describe("tab Fitur ekstensi", () => {
  const contributes = {
    commands: [{ command: "x.hello", title: "Hello", category: "Demo" }, { command: "", title: "kosong" }],
    configuration: [{ title: "A", properties: { "x.a": { type: "boolean", default: true, description: "Satu" }, "x.b": { type: ["string", "null"], default: "q", enum: ["q", "w"], markdownDescription: "**Dua**" } } }, { properties: { "x.c": { type: "number", default: 3 } } }],
    themes: [{ label: "Gelap", uiTheme: "vs-dark", path: "./t.json" }],
    views: { explorer: [{ id: "x.view", name: "Tampilan X" }] },
    keybindings: [{ command: "x.hello", key: "ctrl+h", mac: "cmd+h" }],
  };

  it("mengelompokkan perintah, pengaturan, tema, tampilan, pintasan", () => {
    const s = Object.fromEntries(featureSections(contributes).map((x) => [x.id, x]));
    expect(s.commands.rows).toEqual([{ name: "Demo: Hello", detail: "x.hello" }]);
    expect(s.settings.rows.map((r) => r.name)).toEqual(["x.a", "x.b", "x.c"]);
    expect(s.themes.rows[0]).toEqual({ name: "Gelap", detail: "vs-dark" });
    expect(s.views.rows[0]).toEqual({ name: "Tampilan X", detail: "explorer" });
    expect(s.keybindings.rows[0].detail).toContain("cmd+h");
  });

  it("properti konfigurasi: tipe (larik→pertama), bawaan, enum, deskripsi markdown", () => {
    const p = configProperties(contributes);
    expect(p.find((x) => x.key === "x.b")).toMatchObject({ type: "string", def: "q", enum: ["q", "w"], desc: "**Dua**" });
    expect(p.find((x) => x.key === "x.c")).toMatchObject({ type: "number", def: 3 });
    expect(configProperties(null)).toEqual([]);
  });

  it("kosong atau tak valid = tanpa bagian", () => {
    expect(featureSections(null)).toEqual([]);
    expect(featureSections({})).toEqual([]);
  });
});
