import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as G from "./git";

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

async function repo(name: string) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `nozel-${name}-`)));
  await G.git(d, ["init", "-q", "-b", "main"], "init");
  await G.git(d, ["config", "user.email", "t@t"], "cfg");
  await G.git(d, ["config", "user.name", "t"], "cfg");
  await G.git(d, ["config", "commit.gpgsign", "false"], "cfg");
  return d;
}
const write = (d: string, f: string, s: string) => fs.writeFileSync(path.join(d, f), s);
const commit = (d: string, m: string) => G.git(d, ["commit", "-qam", m], "commit");
async function commitAll(d: string, m: string) {
  await G.git(d, ["add", "-A"], "add");
  await G.git(d, ["commit", "-qm", m], "commit");
}

describe.skipIf(!hasGit)("git lanjutan", () => {
  it("validRef menolak opsi, .. dan karakter terlarang", () => {
    for (const ok of ["main", "fitur/a-b", "v1.2.3"]) expect(G.validRef(ok)).toBe(true);
    for (const bad of ["-x", "a..b", "a b", "a~1", "x.lock", "a/", "@{u}", "a:b"]) expect(G.validRef(bad)).toBe(false);
  });

  it("stash push → list → pop", async () => {
    const d = await repo("stash");
    write(d, "a.txt", "1\n");
    await commitAll(d, "awal");
    write(d, "a.txt", "2\n");
    write(d, "baru.txt", "x");
    await G.gitStashPush(d, "coba", true);
    expect(fs.readFileSync(path.join(d, "a.txt"), "utf8")).toBe("1\n");
    expect(fs.existsSync(path.join(d, "baru.txt"))).toBe(false);
    const list = await G.gitStashList(d);
    expect(list[0].ref).toBe("stash@{0}");
    expect(list[0].message).toContain("coba");
    const r = await G.gitStashApply(d, "stash@{0}", true);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(d, "a.txt"), "utf8")).toBe("2\n");
    expect(await G.gitStashList(d)).toEqual([]);
    await expect(G.gitStashApply(d, "stash@{0}; rm", false)).rejects.toThrow();
  });

  it("merge konflik → opState → abort; cherry-pick & tag", async () => {
    const d = await repo("merge");
    write(d, "a.txt", "awal\n");
    await commitAll(d, "awal");
    await G.gitCheckout(d, "fitur", true);
    write(d, "a.txt", "fitur\n");
    await commit(d, "ubah di fitur");
    const fiturSha = (await G.git(d, ["rev-parse", "HEAD"], "rev")).trim();
    await G.gitCheckout(d, "main", false);
    write(d, "a.txt", "main\n");
    await commit(d, "ubah di main");
    const r = await G.gitMerge(d, "fitur");
    expect(r.conflicts).toBe(true);
    expect(await G.gitOpState(d)).toEqual({ op: "merge", conflicts: 1 });
    expect((await G.gitOpContinue(d)).conflicts).toBe(true);
    await G.gitOpAbort(d);
    expect((await G.gitOpState(d)).op).toBe(null);
    expect(fs.readFileSync(path.join(d, "a.txt"), "utf8")).toBe("main\n");

    // cherry-pick berkas lain tanpa konflik
    await G.gitCheckout(d, "fitur", false);
    write(d, "b.txt", "b\n");
    await commitAll(d, "tambah b");
    const bSha = (await G.git(d, ["rev-parse", "HEAD"], "rev")).trim();
    await G.gitCheckout(d, "main", false);
    expect((await G.gitCherryPick(d, bSha)).ok).toBe(true);
    expect(fs.existsSync(path.join(d, "b.txt"))).toBe(true);

    await G.gitTagCreate(d, "v1.0.0", null, "rilis");
    await G.gitTagCreate(d, "lama", fiturSha, "");
    expect((await G.gitTags(d)).map((t) => t.name).sort()).toEqual(["lama", "v1.0.0"]);
    await G.gitTagDelete(d, "lama");
    expect((await G.gitTags(d)).map((t) => t.name)).toEqual(["v1.0.0"]);

    await G.gitBranchRename(d, "fitur", "fitur2");
    await G.gitBranchDelete(d, "fitur2", true);
    expect((await G.gitBranches(d)).local).toEqual(["main"]);
  });

  it("rebase konflik lalu lanjut setelah diselesaikan", async () => {
    const d = await repo("rebase");
    write(d, "a.txt", "awal\n");
    await commitAll(d, "awal");
    await G.gitCheckout(d, "fitur", true);
    write(d, "a.txt", "fitur\n");
    await commit(d, "fitur");
    await G.gitCheckout(d, "main", false);
    write(d, "a.txt", "main\n");
    await commit(d, "main");
    await G.gitCheckout(d, "fitur", false);
    const r = await G.gitRebase(d, "main");
    expect(r.conflicts).toBe(true);
    expect((await G.gitOpState(d)).op).toBe("rebase");
    write(d, "a.txt", "gabung\n");
    await G.gitStage(d, ["a.txt"]);
    expect((await G.gitOpContinue(d)).ok).toBe(true);
    expect((await G.gitOpState(d)).op).toBe(null);
    const log = await G.gitLog(d, 5);
    expect(log.map((c) => c.subject)).toEqual(["fitur", "main", "awal"]);
    expect(log[0].parents.length).toBe(1);
  });

  it("apply patch satu bagian ke index; blame; show commit", async () => {
    const d = await repo("hunk");
    write(d, "a.txt", "1\n2\n3\n4\n5\n");
    await commitAll(d, "awal");
    write(d, "a.txt", "1\nDUA\n3\n4\nLIMA\n");
    const patch = "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -2,1 +2,1 @@\n-2\n+DUA\n";
    await G.gitApplyPatch(d, patch, true, false);
    const staged = await G.gitDiffFile(d, "a.txt", true);
    expect(staged).toContain("+DUA");
    expect(staged).not.toContain("+LIMA");
    await G.gitApplyPatch(d, patch, true, true);
    expect(await G.gitDiffFile(d, "a.txt", true)).toBe("");
    await expect(G.gitApplyPatch(d, "rm -rf /", true, false)).rejects.toThrow();

    const b = await G.gitBlame(path.join(d, "a.txt"));
    expect(b?.lines.length).toBe(5);
    expect(b?.commits[b.lines[0]].summary).toBe("awal");
    expect(b?.lines[1]).toBe("0000000000000000000000000000000000000000");

    const sha = (await G.git(d, ["rev-parse", "HEAD"], "rev")).trim();
    const show = await G.gitShowCommit(d, sha);
    expect(show.text).toContain("awal");
    expect(show.text).toContain("+1");
  });
});
