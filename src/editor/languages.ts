// Deteksi bahasa dari nama berkas. Paket bahasa dimuat lazy (dynamic import)
// supaya bundle awal tetap kecil; tiap bahasa baru diunduh saat pertama dibuka.

import type { Extension } from "@codemirror/state";
import { extLanguageFor } from "../extensions/registry";
import { tl } from "../i18n";

export interface LanguageInfo {
  name: string;
  /** id pendek untuk snippet & linter */
  id: string;
  load: () => Promise<Extension>;
}

const L = (name: string, id: string, load: () => Promise<Extension>): LanguageInfo => ({ name, id, load });

const js = (o: { jsx?: boolean; typescript?: boolean }) => () => import("@codemirror/lang-javascript").then((m) => m.javascript(o));

export function languageFor(filename: string): LanguageInfo {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";

  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return L("JavaScript", "js", js({}));
    case "jsx":
      return L("JavaScript (JSX)", "js", js({ jsx: true }));
    case "ts":
    case "mts":
    case "cts":
      return L("TypeScript", "ts", js({ typescript: true }));
    case "tsx":
      return L("TypeScript (TSX)", "ts", js({ jsx: true, typescript: true }));
    case "json":
    case "jsonc":
    case "json5":
      return L(ext === "json" ? "JSON" : tl("JSON dengan komentar"), ext === "json" && !isJsoncName(lower) ? "json" : "jsonc", () =>
        import("@codemirror/lang-json").then((m) => m.json())
      );
    case "html":
    case "htm":
      return L("HTML", "html", () => import("@codemirror/lang-html").then((m) => m.html()));
    case "vue":
      return L("Vue", "html", () => import("@codemirror/lang-vue").then((m) => m.vue()));
    case "css":
      return L("CSS", "css", () => import("@codemirror/lang-css").then((m) => m.css()));
    case "scss":
    case "sass":
      return L("Sass", "css", () => import("@codemirror/lang-sass").then((m) => m.sass({ indented: ext === "sass" })));
    case "less":
      return L("Less", "css", () => import("@codemirror/lang-less").then((m) => m.less()));
    case "md":
    case "markdown":
    case "mdx":
      return L("Markdown", "md", async () => {
        const [{ markdown }, { languages }] = await Promise.all([import("@codemirror/lang-markdown"), import("@codemirror/language-data")]);
        return markdown({ codeLanguages: languages });
      });
    case "py":
    case "pyw":
    case "pyi":
      return L("Python", "py", () => import("@codemirror/lang-python").then((m) => m.python()));
    case "rs":
      return L("Rust", "rs", () => import("@codemirror/lang-rust").then((m) => m.rust()));
    case "php":
    case "phtml":
    case "php3":
    case "php4":
    case "php5":
    case "php7":
    case "phps":
      return L("PHP", "php", () => import("./php").then((m) => m.enhancedPhp()));
    case "c":
    case "h":
      return L("C", "c", () => import("@codemirror/lang-cpp").then((m) => m.cpp()));
    case "cpp":
    case "cxx":
    case "cc":
    case "hpp":
    case "hxx":
    case "hh":
      return L("C++", "cpp", () => import("@codemirror/lang-cpp").then((m) => m.cpp()));
    case "java":
      return L("Java", "java", () => import("@codemirror/lang-java").then((m) => m.java()));
    case "go":
      return L("Go", "go", () => import("@codemirror/lang-go").then((m) => m.go()));
    case "sql":
    case "mysql":
    case "pgsql":
    case "sqlite":
      return L("SQL", "sql", () => import("@codemirror/lang-sql").then((m) => m.sql()));
    case "xml":
    case "plist":
    case "xsd":
    case "xsl":
    case "svg":
      return L(ext === "svg" ? "SVG" : "XML", "xml", () => import("@codemirror/lang-xml").then((m) => m.xml()));
    case "yaml":
    case "yml":
      return L("YAML", "yaml", () => import("@codemirror/lang-yaml").then((m) => m.yaml()));
  }

  // Bahasa dari ekstensi (grammar TextMate), mis. Svelte, Astro, Prisma, Elixir.
  const extLang = extLanguageFor(filename);
  if (extLang) {
    return { name: extLang.name, id: extLang.id, load: () => import("../extensions/textmate").then((m) => m.textmateLanguage(extLang.id, extLang.scopeName)) };
  }

  // Selebihnya (Shell, Ruby, Swift, Kotlin, TOML, Dockerfile, Lua, ...) dari registry language-data.
  return {
    name: legacyName(lower, ext),
    id: ext || lower,
    load: async () => {
      const [{ LanguageDescription }, { languages }] = await Promise.all([import("@codemirror/language"), import("@codemirror/language-data")]);
      const desc = LanguageDescription.matchFilename(languages, filename);
      if (!desc) return [];
      return (await desc.load()).extension;
    },
  };
}

function isJsoncName(lower: string): boolean {
  return /(^|\/)(tsconfig[^/]*|jsconfig[^/]*|\.eslintrc|settings|launch|tasks|devcontainer|extensions)\.json$/.test(lower);
}

function legacyName(lower: string, ext: string): string {
  const base = lower.split("/").pop() ?? lower;
  const map: Record<string, string> = {
    sh: "Shell",
    bash: "Shell",
    zsh: "Shell",
    fish: "Shell",
    rb: "Ruby",
    swift: "Swift",
    kt: "Kotlin",
    kts: "Kotlin",
    dart: "Dart",
    lua: "Lua",
    toml: "TOML",
    cs: "C#",
    r: "R",
    pl: "Perl",
    hs: "Haskell",
    ex: "Elixir",
    exs: "Elixir",
    erl: "Erlang",
    clj: "Clojure",
    scala: "Scala",
    ini: "INI",
    env: "Env",
    txt: "Teks",
    log: "Log",
    diff: "Diff",
    patch: "Diff",
  };
  if (base === "dockerfile" || ext === "dockerfile") return "Dockerfile";
  if (base === "makefile") return "Makefile";
  if (base.startsWith(".env")) return "Env";
  if (base === "cmakelists.txt") return "CMake";
  return map[ext] ?? (ext ? ext.toUpperCase() : "Teks");
}
