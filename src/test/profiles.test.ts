import { describe, expect, it } from "vitest";
import { parseProfile, profileFile, profilePatch } from "../app/profiles";
import { setState, DEFAULT_SETTINGS } from "../state/store";

describe("profil pengaturan", () => {
  it("berkas profil tidak membawa izin percaya ekstensi; parse menolak berkas lain", () => {
    setState({ settings: { ...DEFAULT_SETTINGS, trustedExts: ["a.b"], fontSize: 17 } });
    const f = profileFile("Uji");
    expect(f.settings.fontSize).toBe(17);
    expect("trustedExts" in f.settings).toBe(false);
    const back = parseProfile(JSON.stringify({ ...f, extensions: [{ id: "x.y" }, { id: "../jahat" }] }));
    expect(back?.extensions.map((e) => e.id)).toEqual(["x.y"]);
    expect(parseProfile('{"settings":{}}')).toBe(null);
    expect(parseProfile("bukan json")).toBe(null);
  });
  it("patch profil membersihkan nilai rusak dan tidak menyentuh trustedExts", () => {
    const cur = { ...DEFAULT_SETTINGS, trustedExts: ["a.b"], autoSave: "delay" as const };
    const p = profilePatch(cur, { fontSize: 15, tabSize: 4, trustedExts: ["jahat.x"], autoSave: "ngawur" as never });
    expect(p).toEqual({ fontSize: 15, tabSize: 4, autoSave: "off" });
  });
});
