import { describe, expect, it } from "vitest";
import { buildCommitPrompt, cleanCommitMessage, commitLanguage, usesConventional } from "../app/commitMessage";

describe("pesan commit AI", () => {
  it("mengenali gaya Conventional Commits & bahasa commit sebelumnya", () => {
    expect(usesConventional(["feat: a", "fix(ui): b", "chore: c"])).toBe(true);
    expect(usesConventional(["Update README", "Merge branch x"])).toBe(false);
    expect(commitLanguage(["fix: perbaiki tombol untuk mode gelap", "feat: tambah panel dan menu"], "en")).toBe("id");
    expect(commitLanguage(["fix: update the button for dark mode", "feat: add panel and menu"], "id")).toBe("en");
    expect(commitLanguage([], "en")).toBe("en");
  });
  it("prompt memuat diff, contoh gaya & draf", () => {
    const p = buildCommitPrompt({ staged: true, files: ["a.ts"], diff: "+const x = 1;", truncated: false, recent: ["feat: x", "fix: y"] }, "rapikan");
    expect(p).toContain("+const x = 1;");
    expect(p).toContain("Conventional Commits");
    expect(p).toContain("rapikan");
    expect(p).toContain("Staged changes");
  });
  it("jawaban dibersihkan", () => {
    expect(cleanCommitMessage("```\nfeat: tambah tombol.\n\n\n- detail\n```")).toBe("feat: tambah tombol\n\n- detail");
    expect(cleanCommitMessage('Commit message: "fix: typo"')).toBe("fix: typo");
    expect(cleanCommitMessage("feat: x\n\n- y\n\nCo-Authored-By: Bot <b@b>")).toBe("feat: x\n\n- y");
  });
});
