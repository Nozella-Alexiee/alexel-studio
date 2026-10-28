import { describe, expect, it } from "vitest";
// @ts-expect-error modul .mjs tanpa tipe
import { TARGETS, urlFor, VERSION } from "../../scripts/ripgrep/targets.mjs";

describe("ripgrep bundel", () => {
  it("tiap target punya SHA-256 64-hex dan URL rilis resmi yang di-pin", () => {
    expect(Object.keys(TARGETS).sort()).toEqual(["linux-x64", "mac-arm64", "mac-x64", "win-arm64", "win-x64"]);
    for (const t of Object.values(TARGETS) as { asset: string; sha256: string }[]) {
      expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(urlFor(t)).toBe(`https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/ripgrep-${VERSION}-${t.asset}`);
    }
  });
});
