import { describe, expect, it } from "vitest";
import { diffRows } from "../lib/diff";
import { normalizeKeys, prettyKeys } from "../lib/keys";

describe("shortcut lintas OS", () => {
  it("⌘ di macOS, Ctrl di Windows/Linux", () => {
    expect(prettyKeys("Mod+Shift+P", true)).toBe("⌘⇧P");
    expect(prettyKeys("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
    expect(prettyKeys("Mod+Enter", true)).toBe("⌘↵");
    expect(prettyKeys("Mod+Enter", false)).toBe("Ctrl+Enter");
    expect(prettyKeys("Mod+Escape", false)).toBe("Ctrl+Esc");
    expect(normalizeKeys("Ctrl+Mod+T", false)).toBe("Ctrl+Alt+T");
    // Aman dipanggil dua kali (label yang sudah jadi tidak berubah).
    expect(prettyKeys(prettyKeys("Mod+W", false), false)).toBe("Ctrl+W");
    expect(prettyKeys(prettyKeys("Mod+W", true), true)).toBe("⌘W");
  });
});

describe("diff ringkas kartu izin", () => {
  it("baris tambah/hapus dengan konteks", () => {
    const d = diffRows("a\nb\nc\nd\n", "a\nB\nc\nd\n");
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.rows.map((r) => r.k).join("")).toBe(" -+  ");
  });
});
