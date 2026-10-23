// Rekomendasi ekstensi berdasarkan isi project (berkas & dependensi), seperti "Recommended" di VS Code.

export interface Rule {
  id: string;
  /** Cocok bila salah satu pola berkas (glob sederhana per nama/ekstensi) atau dependensi package.json ada. */
  files?: RegExp[];
  deps?: string[];
  why: string;
}

export const RULES: Rule[] = [
  { id: "dbaeumer.vscode-eslint", deps: ["eslint"], files: [/(^|\/)eslint\.config\.[cm]?[jt]s$/, /(^|\/)\.eslintrc(\.[a-z]+)?$/], why: "ESLint" },
  { id: "esbenp.prettier-vscode", deps: ["prettier"], files: [/(^|\/)\.prettierrc(\.[a-z]+)?$/, /(^|\/)prettier\.config\.[cm]?js$/], why: "Prettier" },
  { id: "bradlc.vscode-tailwindcss", deps: ["tailwindcss"], files: [/(^|\/)tailwind\.config\.[cm]?[jt]s$/], why: "Tailwind CSS" },
  { id: "svelte.svelte-vscode", deps: ["svelte"], files: [/\.svelte$/], why: "Svelte" },
  { id: "Vue.volar", deps: ["vue", "nuxt"], files: [/\.vue$/], why: "Vue" },
  { id: "astro-build.astro-vscode", deps: ["astro"], files: [/\.astro$/], why: "Astro" },
  { id: "Prisma.prisma", deps: ["prisma", "@prisma/client"], files: [/\.prisma$/], why: "Prisma" },
  { id: "GraphQL.vscode-graphql", deps: ["graphql"], files: [/\.graphql$/, /\.gql$/], why: "GraphQL" },
  { id: "Angular.ng-template", deps: ["@angular/core"], why: "Angular" },
  { id: "docker.docker", files: [/(^|\/)Dockerfile(\..+)?$/, /(^|\/)(docker-)?compose\.ya?ml$/], why: "Docker" },
  { id: "redhat.vscode-yaml", files: [/\.ya?ml$/], why: "YAML" },
  { id: "tamasfe.even-better-toml", files: [/\.toml$/], why: "TOML" },
  { id: "golang.go", files: [/(^|\/)go\.mod$/, /\.go$/], why: "Go" },
  { id: "rust-lang.rust-analyzer", files: [/(^|\/)Cargo\.toml$/, /\.rs$/], why: "Rust" },
  { id: "ms-python.python", files: [/\.py$/, /(^|\/)(requirements\.txt|pyproject\.toml)$/], why: "Python" },
  { id: "bmewburn.vscode-intelephense-client", files: [/\.php$/, /(^|\/)composer\.json$/], why: "PHP" },
  { id: "Shopify.ruby-lsp", files: [/\.rb$/, /(^|\/)Gemfile$/], why: "Ruby" },
  { id: "redhat.java", files: [/\.java$/, /(^|\/)pom\.xml$/], why: "Java" },
  { id: "Dart-Code.dart-code", files: [/\.dart$/, /(^|\/)pubspec\.yaml$/], why: "Dart" },
  { id: "hashicorp.terraform", files: [/\.tf$/], why: "Terraform" },
  { id: "sumneko.lua", files: [/\.lua$/], why: "Lua" },
  { id: "yzhang.markdown-all-in-one", files: [/\.md$/], why: "Markdown" },
  { id: "mechatroner.rainbow-csv", files: [/\.[ct]sv$/], why: "CSV" },
  { id: "humao.rest-client", files: [/\.(http|rest)$/], why: "REST" },
  { id: "github.vscode-github-actions", files: [/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/], why: "GitHub Actions" },
];

/** Selalu disarankan bila ruangnya masih ada. */
export const ALWAYS = ["usernamehw.errorlens", "PKief.material-icon-theme"];

/**
 * Id ekstensi yang cocok dengan project, urut menurut kecocokan (dependensi lebih kuat daripada ekstensi berkas),
 * tanpa yang sudah terpasang. `files` = path relatif dengan "/".
 */
export function recommend(files: string[], deps: string[], installed: Set<string>, limit = 8): { id: string; why: string }[] {
  const depSet = new Set(deps);
  const lower = new Set([...installed].map((i) => i.toLowerCase()));
  const hits: { id: string; why: string; score: number }[] = [];
  for (const r of RULES) {
    if (lower.has(r.id.toLowerCase())) continue;
    const byDep = r.deps?.some((d) => depSet.has(d)) ?? false;
    const count = r.files ? files.reduce((n, f) => n + (r.files!.some((re) => re.test(f)) ? 1 : 0), 0) : 0;
    if (!byDep && !count) continue;
    hits.push({ id: r.id, why: r.why, score: (byDep ? 1000 : 0) + Math.min(count, 500) });
  }
  hits.sort((a, b) => b.score - a.score);
  const out = hits.slice(0, limit).map(({ id, why }) => ({ id, why }));
  for (const id of ALWAYS) if (out.length < limit && !lower.has(id.toLowerCase()) && !out.some((o) => o.id === id)) out.push({ id, why: "" });
  return out;
}
