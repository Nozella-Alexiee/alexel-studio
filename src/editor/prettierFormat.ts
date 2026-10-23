// Rapikan dokumen dengan Prettier (dibundel, dimuat lazy saat pertama dipakai). Berjalan sepenuhnya
// di renderer: tanpa server bahasa dan tanpa ekstensi Prettier dari VS Code.

type Parser = "babel" | "typescript" | "json" | "json5" | "css" | "scss" | "less" | "html" | "markdown" | "yaml" | "vue";

const BY_EXT: Record<string, Parser> = {
  js: "babel",
  jsx: "babel",
  mjs: "babel",
  cjs: "babel",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  jsonc: "json",
  json5: "json5",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  vue: "vue",
  md: "markdown",
  markdown: "markdown",
  yaml: "yaml",
  yml: "yaml",
};

/** Parser Prettier untuk nama berkas, atau null bila tidak didukung. */
export function prettierParser(filename: string): Parser | null {
  const base = filename.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base === "package.json" || base === "package-lock.json") return "json";
  if (/^(tsconfig|jsconfig)[^/]*\.json$/.test(base) || base === ".eslintrc" || base === ".prettierrc") return "json";
  const ext = base.includes(".") ? base.split(".").pop()! : "";
  return BY_EXT[ext] ?? null;
}

export interface FormatOptions {
  tabWidth: number;
  useTabs: boolean;
}

async function pluginsFor(parser: Parser) {
  const estree = import("prettier/plugins/estree");
  switch (parser) {
    case "babel":
      return [(await import("prettier/plugins/babel")).default, (await estree).default];
    case "typescript":
      return [(await import("prettier/plugins/typescript")).default, (await estree).default];
    case "json":
    case "json5":
      return [(await import("prettier/plugins/babel")).default, (await estree).default];
    case "css":
    case "scss":
    case "less":
      return [(await import("prettier/plugins/postcss")).default];
    case "html":
    case "vue":
      return [(await import("prettier/plugins/html")).default, (await import("prettier/plugins/babel")).default, (await estree).default, (await import("prettier/plugins/postcss")).default, (await import("prettier/plugins/typescript")).default];
    case "markdown":
      return [(await import("prettier/plugins/markdown")).default];
    case "yaml":
      return [(await import("prettier/plugins/yaml")).default];
  }
}

/** Opsi dari `.prettierrc` / `.prettierrc.json` / `package.json#prettier` di root project (JSON saja). */
export async function projectPrettierOptions(root: string | null): Promise<Record<string, unknown>> {
  if (!root) return {};
  const { api } = await import("../lib/ipc");
  const tryRead = async (name: string) => (await api.readText(`${root.replace(/[\\/]$/, "")}/${name}`).catch(() => null))?.content ?? null;
  for (const name of [".prettierrc", ".prettierrc.json"]) {
    const raw = await tryRead(name);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === "object") return j;
    } catch {
      /* bukan JSON (mis. YAML): abaikan */
    }
  }
  const pkg = await tryRead("package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg).prettier;
      if (j && typeof j === "object") return j;
    } catch {
      /* abaikan */
    }
  }
  return {};
}

/** Teks terformat; melempar galat (mis. sintaks salah) dengan pesan Prettier. */
export async function formatWithPrettier(text: string, filename: string, opts: FormatOptions, project: Record<string, unknown> = {}): Promise<string | null> {
  const parser = prettierParser(filename);
  if (!parser) return null;
  const [prettier, plugins] = await Promise.all([import("prettier/standalone"), pluginsFor(parser)]);
  // Aturan project menang atas pengaturan editor; `overrides` per-berkas tidak dibaca.
  const { overrides: _overrides, plugins: _plugins, ...rest } = project as Record<string, unknown>;
  void _overrides;
  void _plugins;
  return prettier.format(text, { tabWidth: opts.tabWidth, useTabs: opts.useTabs, ...rest, parser, plugins });
}
