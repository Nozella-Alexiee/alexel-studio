// Ubah tema warna VS Code (colors + tokenColors) menjadi variabel desain Nozel.
// Tema diterapkan DI ATAS desain aktif: tata letak & Pingu tetap, warnanya yang berganti.

export interface VsTheme {
  name?: string;
  type?: string;
  include?: string;
  colors?: Record<string, string>;
  tokenColors?: { scope?: string | string[]; settings?: { foreground?: string; fontStyle?: string } }[];
}

/** Parse JSON dengan komentar dan koma di akhir (format yang umum di tema VS Code). */
export function parseJsonc(text: string): unknown {
  let out = "";
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inStr = false;
      i++;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
      i++;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      i = i < 0 ? text.length : i + 2;
    } else {
      out += ch;
      i++;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Gabungkan tema dengan tema yang di-include (anak menimpa induk). */
export async function resolveTheme(read: (rel: string) => Promise<string>, rel: string, depth = 0): Promise<VsTheme> {
  const t = parseJsonc(await read(rel)) as VsTheme;
  if (!t.include || depth > 4) return t;
  const base = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  const parent = await resolveTheme(read, normalize(base + t.include), depth + 1).catch(() => ({}) as VsTheme);
  return { ...parent, ...t, colors: { ...parent.colors, ...t.colors }, tokenColors: [...(parent.tokenColors ?? []), ...(t.tokenColors ?? [])] };
}

function normalize(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Warna token untuk satu scope (aturan VS Code: aturan "keyword" berlaku untuk "keyword.control"). */
export function scopeColor(theme: VsTheme, target: string): string | null {
  let best: { len: number; color: string } | null = null;
  for (const rule of theme.tokenColors ?? []) {
    const fg = rule.settings?.foreground;
    if (!fg || !rule.scope) continue;
    const scopes = Array.isArray(rule.scope) ? rule.scope : rule.scope.split(",");
    for (const raw of scopes) {
      const s = raw.trim().split(/\s+/).pop()!; // pemilih bertingkat: ambil bagian paling spesifik
      if (target === s || target.startsWith(s + ".")) {
        if (!best || s.length >= best.len) best = { len: s.length, color: fg };
      }
    }
  }
  return best?.color ?? null;
}

const SYN: Record<string, string[]> = {
  keyword: ["keyword.control", "keyword", "storage.modifier"],
  tag: ["entity.name.tag"],
  self: ["variable.language.this", "variable.language"],
  string: ["string.quoted", "string"],
  regexp: ["string.regexp"],
  number: ["constant.numeric"],
  atom: ["constant.language"],
  function: ["entity.name.function", "support.function"],
  attr: ["entity.other.attribute-name"],
  type: ["entity.name.type", "entity.name.class", "support.type", "support.class", "storage.type"],
  namespace: ["entity.name.namespace", "entity.name.type.module"],
  constant: ["variable.other.constant", "constant.other", "constant"],
  definition: ["variable.other.readwrite", "variable"],
  variable: ["variable.other", "variable"],
  property: ["variable.other.property", "support.type.property-name", "meta.object-literal.key"],
  operator: ["keyword.operator"],
  punct: ["punctuation.separator", "punctuation"],
  comment: ["comment.line", "comment"],
  heading: ["markup.heading", "entity.name.section"],
  link: ["markup.underline.link", "string.other.link"],
};

/** Hex 8 digit (#rrggbbaa) aman dipakai CSS modern; warna kosong dibuang. */
const ok = (c?: string | null) => (c && /^#([0-9a-f]{3,8})$/i.test(c.trim()) ? c.trim() : null);

export function themeToVars(theme: VsTheme, uiTheme: string): { vars: Record<string, string>; scheme: "dark" | "light" } {
  const c = theme.colors ?? {};
  const scheme = /light|^vs$/i.test(uiTheme) || theme.type === "light" ? "light" : "dark";
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = ok(c[k]);
      if (v) return v;
    }
    return null;
  };
  const edBg = pick("editor.background") ?? (scheme === "dark" ? "#1e1e1e" : "#ffffff");
  const fg = pick("editor.foreground", "foreground") ?? (scheme === "dark" ? "#d4d4d4" : "#333333");
  const v: Record<string, string | null> = {
    "--bg": pick("titleBar.activeBackground", "editorGroupHeader.tabsBackground", "sideBar.background") ?? edBg,
    "--surface-1": pick("sideBar.background", "panel.background") ?? edBg,
    "--surface-2": edBg,
    "--surface-3": pick("list.hoverBackground", "input.background", "tab.inactiveBackground"),
    "--surface-hover": pick("list.hoverBackground", "toolbar.hoverBackground"),
    "--surface-popover": pick("editorWidget.background", "dropdown.background", "quickInput.background") ?? edBg,
    "--input-bg": pick("input.background", "dropdown.background"),
    "--border": pick("panel.border", "sideBar.border", "editorGroup.border", "tab.border", "contrastBorder"),
    "--border-strong": pick("input.border", "focusBorder", "panel.border"),
    "--fg": fg,
    "--fg-strong": pick("list.activeSelectionForeground", "tab.activeForeground") ?? fg,
    "--fg-muted": pick("descriptionForeground", "tab.inactiveForeground", "sideBarSectionHeader.foreground"),
    "--fg-subtle": pick("editorLineNumber.foreground", "disabledForeground"),
    "--accent": pick("focusBorder", "button.background", "activityBarBadge.background", "textLink.foreground"),
    "--accent-fg": pick("button.foreground", "activityBarBadge.foreground"),
    "--danger": pick("editorError.foreground", "errorForeground"),
    "--warning": pick("editorWarning.foreground", "list.warningForeground"),
    "--success": pick("gitDecoration.addedResourceForeground", "terminal.ansiGreen"),
    "--git-add": pick("editorGutter.addedBackground", "gitDecoration.addedResourceForeground"),
    "--git-mod": pick("editorGutter.modifiedBackground", "gitDecoration.modifiedResourceForeground"),
    "--git-del": pick("editorGutter.deletedBackground", "gitDecoration.deletedResourceForeground"),
    "--ed-bg": edBg,
    "--ed-fg": fg,
    "--ed-gutter-bg": pick("editorGutter.background") ?? edBg,
    "--ed-gutter-fg": pick("editorLineNumber.foreground"),
    "--ed-active-line": pick("editor.lineHighlightBackground"),
    "--ed-selection": pick("editor.selectionBackground"),
    "--ed-match": pick("editor.findMatchHighlightBackground", "editor.wordHighlightBackground"),
    "--ed-bracket": pick("editorBracketMatch.background"),
    "--term-bg": pick("terminal.background", "panel.background") ?? edBg,
    "--term-fg": pick("terminal.foreground") ?? fg,
    "--ansi-black": pick("terminal.ansiBlack"),
    "--ansi-red": pick("terminal.ansiRed"),
    "--ansi-green": pick("terminal.ansiGreen"),
    "--ansi-yellow": pick("terminal.ansiYellow"),
    "--ansi-blue": pick("terminal.ansiBlue"),
    "--ansi-magenta": pick("terminal.ansiMagenta"),
    "--ansi-cyan": pick("terminal.ansiCyan"),
    "--ansi-white": pick("terminal.ansiWhite"),
    "--ansi-bright-black": pick("terminal.ansiBrightBlack"),
    "--ansi-bright-white": pick("terminal.ansiBrightWhite"),
    "--snap-bg": pick("sideBar.background") ?? edBg,
  };
  for (const [name, scopes] of Object.entries(SYN)) {
    let col: string | null = null;
    for (const s of scopes) if ((col = ok(scopeColor(theme, s)))) break;
    v[`--syn-${name}`] = col;
  }
  fillGaps(v, fg, edBg, scheme);
  const vars: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (val) vars[k] = val;
  return { vars, scheme };
}

const mix = (a: string, pct: number, b: string) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** Warna default terminal VS Code, dipakai bila tema tidak mengisinya. */
const ANSI = {
  dark: { black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510", blue: "#2472c8", magenta: "#bc3fbc", cyan: "#11a8cd", white: "#e5e5e5", "bright-black": "#666666", "bright-white": "#e5e5e5" },
  light: { black: "#000000", red: "#cd3131", green: "#00bc00", yellow: "#949800", blue: "#0451a5", magenta: "#bc05bc", cyan: "#0598bc", white: "#555555", "bright-black": "#666666", "bright-white": "#a5a5a5" },
};

/** Luminans relatif kasar dari hex; null bila bukan hex. */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Tema VS Code jarang mengisi semua warna. Yang kosong diturunkan dari warna dasar tema itu
 * sendiri, bukan dibiarkan jatuh ke desain aktif: tema gelap di atas desain terang (atau
 * sebaliknya) tidak boleh mewarisi warna desain yang kontrasnya terbalik.
 */
function fillGaps(v: Record<string, string | null>, fg: string, edBg: string, scheme: "dark" | "light") {
  const dark = scheme === "dark";
  const surface1 = v["--surface-1"] ?? edBg;
  const def: Record<string, string> = {
    "--surface-3": mix(fg, 8, edBg),
    "--surface-hover": mix(fg, 6, edBg),
    "--input-bg": mix(fg, 5, edBg),
    "--border": mix(fg, 14, edBg),
    "--border-strong": mix(fg, 24, edBg),
    "--fg-muted": mix(fg, 72, edBg),
    "--fg-subtle": mix(fg, 50, edBg),
    "--ed-gutter-fg": mix(fg, 45, edBg),
    "--ed-active-line": mix(fg, 5, "transparent"),
    "--ed-selection": mix("var(--accent)", 28, "transparent"),
    "--ed-match": mix(fg, 16, "transparent"),
    "--ed-bracket": mix(fg, 20, "transparent"),
    "--glass": mix(surface1, 85, "transparent"),
    "--scrim": dark ? "rgba(0, 0, 0, 0.55)" : "rgba(20, 20, 30, 0.28)",
    "--shadow-pop": dark ? "0 16px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)" : "0 18px 50px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08)",
    "--minimap-fg": mix(fg, 34, "transparent"),
    "--minimap-view": mix(fg, 8, "transparent"),
    "--git-untracked": v["--git-add"] ?? (dark ? "#73c991" : "#2e7d32"),
    "--syn-comment": mix(fg, 50, edBg),
  };
  for (const [k, val] of Object.entries(ANSI[scheme])) def[`--ansi-${k}`] = val;
  for (const name of Object.keys(SYN)) def[`--syn-${name}`] ??= fg;
  const acc = v["--accent"];
  if (acc && !v["--accent-fg"]) {
    const l = luminance(acc);
    if (l !== null) def["--accent-fg"] = l > 0.55 ? "#111111" : "#ffffff";
  }
  for (const [k, val] of Object.entries(def)) v[k] ??= val;
}

const STYLE_ID = "nozel-ext-theme";

export function applyThemeVars(vars: Record<string, string> | null, scheme?: "dark" | "light") {
  const root = document.documentElement;
  document.getElementById(STYLE_ID)?.remove();
  if (!vars) {
    delete root.dataset.extTheme;
    return;
  }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `html[data-ext-theme]{color-scheme:${scheme ?? "dark"};${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
  document.head.appendChild(el);
  root.dataset.extTheme = "1";
  if (scheme) root.dataset.scheme = scheme;
}
