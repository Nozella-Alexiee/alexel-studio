import { describe, expect, it } from "vitest";
import { globMatch, globToRegExp } from "./glob";

describe("exthost glob: pola rusak dari ekstensi tidak melempar", () => {
  it("kurung kurawal tanpa pasangan dan rentang terbalik", () => {
    expect(() => globToRegExp("*.{ts")).not.toThrow();
    expect(globMatch("*.{ts", "src/a.ts")).toBe(true);
    expect(() => globToRegExp("[z-a].ts")).not.toThrow();
    expect(globMatch("[z-a].ts", "a.ts")).toBe(false);
    expect(globMatch("**/*.{ts,tsx}", "src/a.tsx")).toBe(true);
  });
});
