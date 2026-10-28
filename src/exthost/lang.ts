// Id bahasa gaya VS Code untuk sebuah berkas (dipakai ekstensi: onLanguage:*, selector provider).

import { extname } from "../lib/paths";

/** Id bahasa Alexel → id VS Code, untuk bahasa yang namanya berbeda. */
const BY_ALEXEL: Record<string, string> = { txt: "plaintext", text: "plaintext", ts: "typescript", js: "javascript", py: "python", rs: "rust", md: "markdown", yml: "yaml", sh: "shellscript", bash: "shellscript", zsh: "shellscript", rb: "ruby", kt: "kotlin", cs: "csharp", pl: "perl", hs: "haskell", ex: "elixir", exs: "elixir", erl: "erlang", clj: "clojure", htm: "html", jsonc: "jsonc", mysql: "sql", pgsql: "sql" };

export function vscodeLanguageId(path: string, langId: string): string {
  const ext = extname(path);
  if (langId === "ts") return ext === "tsx" ? "typescriptreact" : "typescript";
  if (langId === "js") return ext === "jsx" ? "javascriptreact" : "javascript";
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if (base === "makefile") return "makefile";
  if (/^(docker-)?compose\.ya?ml$/.test(base)) return "yaml";
  return BY_ALEXEL[langId] ?? langId;
}
