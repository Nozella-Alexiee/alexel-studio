// Regresi dari audit rilis 1.0 (renderer): pengaturan rusak, path gambar/tautan Markdown, tab non-teks saat rename/hapus.
import { beforeEach, describe, expect, it } from "vitest";
import { localImageSrc, normalizePath, isInside } from "../lib/paths";
import { sanitizeSettings } from "../app/persist";
import { openPathsUnder } from "../app/actions";
import { setState } from "../state/store";
import type { Settings } from "../state/store";

describe("sanitizeSettings: nilai salah ketik di settings.json", () => {
  it("gitBot tidak dikenal → off (bukan auto-commit diam-diam)", () => {
    expect(sanitizeSettings({ gitBot: "of" } as unknown as Partial<Settings>).gitBot).toBe("off");
    expect(sanitizeSettings({ gitBot: "push" }).gitBot).toBe("push");
  });
  it("powerMode, accent, confirmDelete divalidasi", () => {
    const s = sanitizeSettings({ powerMode: "x", accent: "red;}body{display:none", confirmDelete: "no" } as unknown as Partial<Settings>);
    expect(s.powerMode).toBe("auto");
    expect(s.accent).toBeNull();
    expect(s.confirmDelete).toBe(true);
    expect(sanitizeSettings({ accent: "#ff8a3d", confirmDelete: false }).accent).toBe("#ff8a3d");
    expect(sanitizeSettings({ confirmDelete: false }).confirmDelete).toBe(false);
  });
});

describe("localImageSrc: gambar & tautan relatif di pratinjau Markdown", () => {
  const root = "/p/proj";
  const at = (src: string) => normalizePath(localImageSrc(src, "/p/proj/docs"));
  it("../ keluar project tidak lolos pemeriksaan isInside", () => {
    expect(isInside(root, at("../../../etc/passwd"))).toBe(false);
    expect(isInside(root, at("../../proj-secret/x.png"))).toBe(false);
    expect(at("../img/a.png")).toBe("/p/proj/img/a.png");
  });
  it("nama berkas berspasi/unicode (URL-encoded) didekode, query & anchor dibuang", () => {
    expect(at("my%20image.png")).toBe("/p/proj/docs/my image.png");
    expect(at("gambar%E2%80%93baru.png?raw=1")).toBe("/p/proj/docs/gambar–baru.png");
    expect(at("other.md#bagian")).toBe("/p/proj/docs/other.md");
    expect(at("bad%zz.png")).toBe("/p/proj/docs/bad%zz.png");
  });
  it("path absolut & Windows", () => {
    expect(localImageSrc("/p/proj/a.png", "/x")).toBe("/p/proj/a.png");
    expect(localImageSrc("C:\\proj\\a.png", "C:/proj/docs")).toBe("C:/proj/a.png");
  });
});

describe("openPathsUnder: tab non-teks ikut di-rename/ditutup", () => {
  beforeEach(() => {
    setState({
      tabs: {
        "/p/a/logo.png": { id: "/p/a/logo.png", name: "logo.png", kind: "image", dirty: false, lang: "Gambar", preview: "code" },
        "/p/a/doc.pdf": { id: "/p/a/doc.pdf", name: "doc.pdf", kind: "pdf", dirty: false, lang: "PDF", preview: "code" },
        "/p/ab/x.png": { id: "/p/ab/x.png", name: "x.png", kind: "image", dirty: false, lang: "Gambar", preview: "code" },
        "nozel:settings": { id: "nozel:settings", name: "Pengaturan", kind: "settings", dirty: false, lang: "", preview: "code" },
      },
    });
  });
  it("berkas tunggal dan isi folder, tanpa folder bernama mirip", () => {
    expect(openPathsUnder("/p/a/logo.png")).toEqual(["/p/a/logo.png"]);
    expect(openPathsUnder("/p/a").sort()).toEqual(["/p/a/doc.pdf", "/p/a/logo.png"]);
  });
});

describe("uriToPath: URI rusak dari server bahasa", () => {
  it("tidak melempar URIError", async () => {
    const { uriToPath } = await import("../editor/lsp");
    expect(uriToPath("file:///p/100%.ts")).toBe("/p/100%.ts");
  });
});

describe("snapshotRange: seleksi panjang dibatasi", () => {
  it("maks 400 baris supaya kanvas tidak melebihi batas", async () => {
    const { EditorState } = await import("@codemirror/state");
    const { snapshotRange } = await import("../editor/snapshot");
    const doc = Array.from({ length: 2000 }, (_, i) => `baris ${i + 1}`).join("\n");
    const st = EditorState.create({ doc, selection: { anchor: 0, head: doc.length } });
    const r = snapshotRange(st);
    expect(r.firstLine).toBe(1);
    expect(st.doc.lineAt(r.to).number).toBe(400);
  });
});

describe("globMatch: pola rusak dari ekstensi tidak melempar", () => {
  it("kurung kurawal tak berpasangan & rentang terbalik", async () => {
    const { globMatch, globToRegExp } = await import("../lib/glob");
    expect(() => globToRegExp("*.{ts")).not.toThrow();
    expect(globMatch("*.{ts", "src/a.ts")).toBe(true);
    expect(globMatch("[z-a].ts", "a.ts")).toBe(false);
    expect(globMatch("**/*.{ts,tsx}", "src/a.tsx")).toBe(true);
  });
});

describe("profil impor tidak membawa pengaturan keamanan", () => {
  it("trustedFolders & acpCommand dari profil diabaikan", async () => {
    const { profilePatch } = await import("../app/profiles");
    const { DEFAULT_SETTINGS } = await import("../state/store");
    const p = profilePatch({ ...DEFAULT_SETTINGS }, { trustedFolders: ["/"], acpCommand: "curl x | sh", fontSize: 15 });
    expect(p).toEqual({ fontSize: 15 });
  });
});
