import { describe, expect, it } from "vitest";
import { alpha, colorFor, mix, vscodeThemeVars, type Palette } from "../exthost/vscodeTheme";
import { VSCODE_COLOR_NAMES } from "../exthost/vscodeColorNames";

const p: Palette = { dark: true, bg: "#101010", fg: "#dddddd", fgStrong: "#ffffff", fgMuted: "#aaaaaa", fgSubtle: "#777777", surface1: "#141414", surface2: "#1a1a1a", surface3: "#222222", hover: "#2a2a2a", popover: "#1c1c1c", sidebar: "#121212", border: "#333333", accent: "#3b82f6", accentFg: "#ffffff", accentText: "#60a5fa", success: "#22c55e", warning: "#eab308", danger: "#ef4444", input: "#181818", fontUi: "system-ui", fontMono: "monospace", fontSize: 14 };

describe("tema VS Code untuk webview", () => {
  it("semua variabel warna punya nilai (tidak ada tombol/ikon yang hilang warnanya)", () => {
    const v = vscodeThemeVars(p);
    for (const n of VSCODE_COLOR_NAMES) expect(v[`--vscode-${n}`], n).toBeTruthy();
    expect(Object.keys(v).length).toBeGreaterThan(700);
  });
  it("aturan nama: tombol, badge, latar, garis, nada", () => {
    expect(colorFor("button-background", p)).toBe(p.accent);
    expect(colorFor("button-foreground", p)).toBe(p.accentFg);
    expect(colorFor("button-secondaryBackground", p)).toBe(p.surface3);
    expect(colorFor("badge-foreground", p)).toBe(p.accentFg);
    expect(colorFor("menu-background", p)).toBe(p.popover);
    expect(colorFor("list-hoverBackground", p)).toBe(p.hover);
    expect(colorFor("editorError-foreground", p)).toBe(p.danger);
    expect(colorFor("diffEditor-insertedTextBackground", p)).toBe(alpha(p.success, 0.18));
    expect(colorFor("terminal-ansiRed", p)).toBe("#cd3131");
    expect(colorFor("contrastBorder", p)).toBe("rgba(0, 0, 0, 0)");
    expect(vscodeThemeVars(p)["--vscode-editor-font-size"]).toBe("14px");
  });
  it("alpha & mix menghasilkan warna konkret", () => {
    expect(alpha("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
