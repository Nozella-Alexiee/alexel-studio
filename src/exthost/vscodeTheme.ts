// Variabel tema VS Code (--vscode-*) untuk webview ekstensi, dihitung dari desain Alexel Studio yang
// aktif. VS Code menyediakan ratusan warna (tombol, menu, badge, diff, terminal…); webview seperti
// Claude Code dan Codex memakainya langsung, dan yang tidak terdefinisi membuat tombol/ikon tak
// terlihat. Warna yang tidak dipetakan khusus diturunkan dengan aturan dari namanya.

import { VSCODE_COLOR_NAMES } from "./vscodeColorNames";

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parse(c: string): Rgba | null {
  const s = c.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith("%") ? (parseFloat(x) / 100) * 255 : parseFloat(x)));
    if (p.length >= 3 && p.slice(0, 3).every((x) => Number.isFinite(x))) return { r: p[0], g: p[1], b: p[2], a: p[3] !== undefined ? (m[1].includes("%") && p[3] > 1 ? p[3] / 255 : p[3]) : 1 };
  }
  return null;
}

const css = (c: Rgba) => (c.a >= 1 ? `#${[c.r, c.g, c.b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}` : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(3)})`);

/** Warna dengan alpha (seperti `color-mix(... transparent)`, tapi hasilnya warna konkret yang bisa dibaca JS). */
export function alpha(color: string, a: number): string {
  const c = parse(color);
  return c ? css({ ...c, a: c.a * a }) : color;
}

/** Campur dua warna (t = porsi `b`). */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return a;
  return css({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t });
}

export interface Palette {
  dark: boolean;
  bg: string;
  fg: string;
  fgStrong: string;
  fgMuted: string;
  fgSubtle: string;
  surface1: string;
  surface2: string;
  surface3: string;
  hover: string;
  popover: string;
  sidebar: string;
  border: string;
  accent: string;
  accentFg: string;
  accentText: string;
  success: string;
  warning: string;
  danger: string;
  input: string;
  fontUi: string;
  fontMono: string;
  fontSize: number;
}

const ANSI_DARK = ["#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5", "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#e5e5e5"];
const ANSI_LIGHT = ["#000000", "#cd3131", "#00bc00", "#949800", "#0451a5", "#bc05bc", "#0598bc", "#555555", "#666666", "#cd3131", "#14ce14", "#b5ba00", "#0451a5", "#bc05bc", "#0598bc", "#a5a5a5"];
const ANSI = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White", "BrightBlack", "BrightRed", "BrightGreen", "BrightYellow", "BrightBlue", "BrightMagenta", "BrightCyan", "BrightWhite"];

/** Nilai satu variabel warna dari namanya (tanpa awalan --vscode-). */
export function colorFor(name: string, p: Palette): string {
  const n = name.toLowerCase();
  const ansi = /^terminal-ansi(\w+)$/i.exec(name);
  if (ansi) {
    const i = ANSI.findIndex((x) => x.toLowerCase() === ansi[1].toLowerCase());
    if (i >= 0) return (p.dark ? ANSI_DARK : ANSI_LIGHT)[i];
  }
  const chart: Record<string, string> = { red: p.danger, green: p.success, yellow: p.warning, orange: mix(p.warning, p.danger, 0.4), blue: p.accent, purple: "#b180d7", lines: alpha(p.fgMuted, 0.5), foreground: p.fg };
  const ch = /^charts-(\w+)$/.exec(n);
  if (ch && chart[ch[1]]) return chart[ch[1]];

  const tone = n.includes("error") || n.includes("deleted") || n.includes("removed") || n.includes("failed") || n.includes("conflict") ? p.danger : n.includes("warning") || n.includes("modified") ? p.warning : n.includes("inserted") || n.includes("added") || n.includes("passed") || n.includes("untracked") ? p.success : n.includes("info") ? p.accent : null;

  if (/shadow/.test(n)) return p.dark ? "rgba(0, 0, 0, 0.36)" : "rgba(0, 0, 0, 0.16)";
  if (/contrast(active)?border/.test(n)) return "rgba(0, 0, 0, 0)";
  if (/border|outline|separator|sash-hoverborder|divider/.test(n)) {
    if (n.includes("focus") || n.startsWith("sash") || n.includes("activeborder") || n.includes("inputoption-activeborder")) return p.accent;
    if (tone) return alpha(tone, 0.8);
    if (n.startsWith("button") || n.startsWith("checkbox-") || n.includes("transparent")) return n.startsWith("checkbox") ? p.border : "rgba(0, 0, 0, 0)";
    return p.border;
  }
  if (/scrollbarslider/.test(n)) return alpha(p.fgSubtle, n.includes("active") ? 0.55 : n.includes("hover") ? 0.45 : 0.3);
  if (/background|highlight|selection|fill|rangehighlight|findmatch|dropbackground|wordhighlight/.test(n) && !/foreground/.test(n)) {
    if (n.includes("button-secondary")) return n.includes("hover") ? p.hover : p.surface3;
    if (n.startsWith("button") || n.startsWith("extensionbutton")) return n.includes("hover") ? mix(p.accent, p.fgStrong, 0.12) : p.accent;
    if (n.startsWith("badge") || n.startsWith("activitybarbadge") || n.includes("progressbar")) return p.accent;
    if (n.includes("checkbox")) return p.input;
    if (tone) return alpha(tone, n.includes("text") || n.includes("line") ? 0.18 : 0.22);
    if (n.includes("selection") || n.includes("findmatch") || n.includes("wordhighlight") || n.includes("drop")) return alpha(p.accent, n.includes("inactive") ? 0.18 : 0.32);
    if (n.includes("hover") || n.includes("linehighlight") || n.includes("toolbar-active")) return p.hover;
    if (/menu|dropdown|widget|hoverwidget|quickinput|notification|peekview|suggest|picker|debugtoolbar|commandcenter|keybindinglabel/.test(n)) return p.popover;
    if (/input|settings-text|settings-number|settings-dropdown/.test(n)) return p.input;
    if (/sidebar|panel|activitybar|titlebar|statusbar|tab|editorgroupheader|breadcrumb|banner|welcomepage/.test(n)) return p.sidebar;
    if (/codeblock|textblockquote|textpreformat|chat-requestbackground/.test(n)) return p.surface2;
    if (n.includes("terminal") || n.startsWith("editor") || n.includes("minimap") || n === "background") return p.bg;
    return p.surface1;
  }
  // Selain itu: warna teks/ikon.
  if (n.includes("button-secondary")) return p.fg;
  if (n.startsWith("button") || n.startsWith("badge") || n.startsWith("activitybarbadge") || n.startsWith("extensionbutton")) return p.accentFg;
  if (tone) return tone;
  if (/link|textlink|focusborder|progressbar/.test(n)) return p.accentText;
  if (/disabled|description|placeholder|inactive|linenumber|ignored|codelens|ghosttext|whitespace|deemphasized|unnecessary|muted|caption/.test(n)) return n.includes("linenumber") && n.includes("active") ? p.fg : p.fgSubtle;
  if (n.includes("activeselection") || n.includes("highlightforeground") || n.includes("focusforeground")) return p.fgStrong;
  if (n.includes("cursor")) return p.accent;
  return p.fg;
}

/** Variabel non-warna (huruf, ukuran) yang juga diharapkan ada. */
function layoutVars(p: Palette): Record<string, string> {
  const size = `${p.fontSize}px`;
  return {
    "--vscode-font-family": p.fontUi,
    "--vscode-font-size": "13px",
    "--vscode-font-weight": "normal",
    "--vscode-editor-font-family": p.fontMono,
    "--vscode-editor-font-size": size,
    "--vscode-editor-font-weight": "normal",
    "--vscode-chat-font-family": p.fontUi,
    "--vscode-chat-font-size": "13px",
    "--vscode-editorCodeLens-fontFamily": p.fontUi,
    "--vscode-editorCodeLens-fontFamilyDefault": p.fontUi,
    "--vscode-editorCodeLens-fontSize": "12px",
    "--vscode-editorCodeLens-lineHeight": "18px",
    "--vscode-editorCodeLens-fontFeatureSettings": "normal",
    "--vscode-parameterHintsWidget-editorFontFamily": p.fontMono,
    "--vscode-parameterHintsWidget-editorFontFamilyDefault": p.fontMono,
    "--vscode-editorWhitespace-foreground": alpha(p.fgSubtle, 0.5),
    "--vscode-editorWidget-resizeBorder": p.accent,
    "--vscode-list-deemphasizedForeground": p.fgSubtle,
    "--vscode-hover-maxWidth": "500px",
    "--vscode-hover-whiteSpace": "normal",
    "--vscode-hover-sourceWhiteSpace": "nowrap",
    "--vscode-sash-size": "4px",
    "--vscode-sash-hover-size": "4px",
    "--vscode-editorUnnecessaryCode-opacity": "0.67",
    "--vscode-minimap-foregroundOpacity": "1",
    "--vscode-editorStickyScroll-scrollableWidth": "0px",
    "--vscode-editorStickyScroll-foldingOpacityTransition": "opacity 0.5s",
    "--vscode-icon-x-font-family": "codicon",
  };
}

/** Warna desain aktif dari variabel CSS dokumen. */
export function paletteFromDocument(fontSize = 13): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  const dark = document.documentElement.dataset.scheme !== "light";
  const bg = v("--ed-bg", v("--bg", dark ? "#1e1e1e" : "#ffffff"));
  const fg = v("--ed-fg", v("--fg", dark ? "#cccccc" : "#333333"));
  const accent = v("--accent", "#0e639c");
  return {
    dark,
    bg,
    fg: v("--fg", fg),
    fgStrong: v("--fg-strong", fg),
    fgMuted: v("--fg-muted", fg),
    fgSubtle: v("--fg-subtle", v("--fg-muted", fg)),
    surface1: v("--surface-1", bg),
    surface2: v("--surface-2", bg),
    surface3: v("--surface-3", bg),
    hover: v("--surface-hover", alpha(fg, 0.08)),
    popover: v("--surface-popover", v("--surface-2", bg)),
    sidebar: v("--sidebar-bg", v("--surface-1", bg)),
    border: v("--border", dark ? "#444444" : "#d4d4d4"),
    accent,
    accentFg: v("--accent-fg", "#ffffff"),
    accentText: v("--accent-text", accent),
    success: v("--success", "#89d185"),
    warning: v("--warning", "#cca700"),
    danger: v("--danger", "#f14c4c"),
    input: v("--input-bg", v("--surface-2", bg)),
    fontUi: v("--font-ui", "system-ui, sans-serif"),
    fontMono: v("--font-mono", "monospace"),
    fontSize,
  };
}

/** Semua variabel --vscode-* untuk palet ini. */
export function vscodeThemeVars(p: Palette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of VSCODE_COLOR_NAMES) out[`--vscode-${name}`] = colorFor(name, p);
  // Warna inti yang paling sering dipakai: pastikan memakai token persis.
  Object.assign(out, {
    "--vscode-foreground": p.fg,
    "--vscode-descriptionForeground": p.fgMuted,
    "--vscode-disabledForeground": p.fgSubtle,
    "--vscode-errorForeground": p.danger,
    "--vscode-icon-foreground": p.fg,
    "--vscode-focusBorder": p.accent,
    "--vscode-widget-border": p.border,
    "--vscode-editor-background": p.bg,
    "--vscode-editor-foreground": p.fg,
    "--vscode-sideBar-background": p.sidebar,
    "--vscode-sideBar-foreground": p.fg,
    "--vscode-panel-background": p.sidebar,
    "--vscode-panel-border": p.border,
    "--vscode-textLink-foreground": p.accentText,
    "--vscode-textLink-activeForeground": p.accentText,
    "--vscode-button-background": p.accent,
    "--vscode-button-foreground": p.accentFg,
    "--vscode-button-hoverBackground": mix(p.accent, p.fgStrong, 0.12),
    "--vscode-button-secondaryBackground": p.surface3,
    "--vscode-button-secondaryForeground": p.fg,
    "--vscode-button-secondaryHoverBackground": p.hover,
    "--vscode-input-background": p.input,
    "--vscode-input-foreground": p.fg,
    "--vscode-input-border": p.border,
    "--vscode-input-placeholderForeground": p.fgSubtle,
    "--vscode-dropdown-background": p.popover,
    "--vscode-dropdown-foreground": p.fg,
    "--vscode-dropdown-border": p.border,
    "--vscode-menu-background": p.popover,
    "--vscode-menu-foreground": p.fg,
    "--vscode-badge-background": p.accent,
    "--vscode-badge-foreground": p.accentFg,
    "--vscode-list-hoverBackground": p.hover,
    "--vscode-list-activeSelectionBackground": alpha(p.accent, 0.3),
    "--vscode-list-activeSelectionForeground": p.fgStrong,
    "--vscode-editorWidget-background": p.popover,
    "--vscode-editorHoverWidget-background": p.popover,
    "--vscode-editorHoverWidget-foreground": p.fg,
    "--vscode-editorHoverWidget-border": p.border,
    "--vscode-textCodeBlock-background": p.surface2,
    "--vscode-terminal-background": p.bg,
    "--vscode-terminal-foreground": p.fg,
  });
  return { ...out, ...layoutVars(p) };
}
