import { describe, expect, it } from "vitest";
import { claudeEffortLevels, claudeModesAvailable, selectedModel } from "../claude/options";
import type { ClaudeModel } from "../lib/types";

const opus: ClaudeModel = { value: "opus", displayName: "Opus", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"], supportsAutoMode: true };
const sonnet46: ClaudeModel = { value: "claude-sonnet-4-6", displayName: "Sonnet 4.6", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "max"], supportsAutoMode: true };
const haiku45: ClaudeModel = { value: "claude-haiku-4-5", displayName: "Haiku 4.5" };
const noEffort: ClaudeModel = { value: "old", displayName: "Old", supportsEffort: false };

describe("opsi Claude per model", () => {
  it("effort mengikuti model; tanpa daftar = low/medium/high; tanpa dukungan = tersembunyi", () => {
    expect(claudeEffortLevels(opus)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(claudeEffortLevels(sonnet46)).toEqual(["low", "medium", "high", "max"]);
    expect(claudeEffortLevels(haiku45)).toEqual(["low", "medium", "high"]);
    expect(claudeEffortLevels(noEffort)).toBeNull();
    expect(claudeEffortLevels(undefined)).toEqual(["low", "medium", "high"]);
  });
  it("tidak pernah menawarkan nilai yang tidak ada di --help CLI, dan 'ultra' tidak pernah untuk Claude", () => {
    expect(claudeEffortLevels(opus, ["low", "medium", "high"])).toEqual(["low", "medium", "high"]);
    expect(claudeEffortLevels(opus)).not.toContain("ultra");
  });
  it("model terpilih: nilai tak dikenal jatuh ke default", () => {
    const list = [{ value: "default", displayName: "D" }, opus];
    expect(selectedModel(list, "opus")?.value).toBe("opus");
    expect(selectedModel(list, "zzz")?.value).toBe("default");
  });
  it("mode: auto hanya bila model & CLI mendukung; bypass hanya bila diizinkan; default boleh lewat alias manual", () => {
    const cli = { installed: true, permissionModes: ["acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"] };
    const ids = (m: ClaudeModel | undefined, allow: boolean, c: typeof cli | undefined = cli) => claudeModesAvailable(c, m, allow).map((x) => x.id);
    expect(ids(opus, false)).toEqual(["default", "acceptEdits", "plan", "auto"]);
    expect(ids(haiku45, false)).toEqual(["default", "acceptEdits", "plan"]);
    expect(ids(opus, true)).toContain("bypassPermissions");
    expect(ids(opus, false, { installed: true, permissionModes: ["acceptEdits", "plan", "default"] })).not.toContain("auto");
    // CLI lama tanpa informasi --help: tidak membatasi (selain auto yang butuh dukungan model).
    expect(ids(opus, false, { installed: true } as never)).toEqual(["default", "acceptEdits", "plan", "auto"]);
  });
});
