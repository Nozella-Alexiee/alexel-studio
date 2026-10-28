// Git lewat CLI `git`: status, stage/unstage, discard, commit, push/pull, riwayat, branch.
// Prompt kredensial dimatikan dan semua perintah punya batas waktu.

import fs from "node:fs";
import path from "node:path";
import { gitEnv, isWithin, runCapture, type Captured, type Ctx } from "./util";

const SHORT = 15_000;
const NETWORK = 90_000;

export interface GitFile {
  path: string;
  orig_path?: string | null;
  xy: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface GitStatus {
  is_repo: boolean;
  root: string;
  branch: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}

const none = (): GitStatus => ({ is_repo: false, root: "", branch: "", upstream: null, ahead: 0, behind: 0, files: [] });

function orErr(c: Captured, what: string): string {
  if (c.timedOut) throw new Error(`${what} terlalu lama dan dihentikan.`);
  if (c.success) return c.stdout;
  throw new Error(`${what} gagal: ${(c.stderr.trim() || c.stdout.trim())}`);
}

export async function git(dir: string, args: string[], what: string, timeoutMs = SHORT): Promise<string> {
  return orErr(await runCapture("git", args, { cwd: dir, env: gitEnv(), timeoutMs }), what);
}

/** Parse `git status --porcelain=v1 -b -z`. */
export function parseStatus(out: string): GitStatus {
  const st = none();
  st.is_repo = true;
  const parts = out.split("\0").filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.startsWith("## ")) {
      parseBranch(entry.slice(3), st);
      continue;
    }
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const p = entry.slice(3);
    const [x, y] = [xy[0], xy[1]];
    const orig = x === "R" || x === "C" ? parts[++i] ?? null : null;
    const untracked = xy === "??";
    const conflicted = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(xy);
    st.files.push({ path: p, orig_path: orig, xy, staged: !untracked && !conflicted && x !== " ", unstaged: untracked || conflicted || y !== " ", untracked, conflicted });
  }
  return st;
}

function parseBranch(head: string, st: GitStatus) {
  const i = head.indexOf(" [");
  let names = i >= 0 ? head.slice(0, i) : head;
  const track = i >= 0 ? head.slice(i + 2, -1) : null;
  names = names.replace(/^No commits yet on /, "").replace(/^Initial commit on /, "");
  const [b, u] = names.split("...");
  st.branch = b;
  st.upstream = u ?? null;
  for (const piece of track?.split(", ") ?? []) {
    if (piece.startsWith("ahead ")) st.ahead = Number(piece.slice(6)) || 0;
    if (piece.startsWith("behind ")) st.behind = Number(piece.slice(7)) || 0;
  }
}

async function isRepo(dir: string): Promise<boolean> {
  try {
    return (await git(dir, ["rev-parse", "--is-inside-work-tree"], "rev-parse")).trim() === "true";
  } catch {
    return false;
  }
}

export async function gitStatus(dir: string): Promise<GitStatus> {
  if (!fs.existsSync(dir) || !(await isRepo(dir))) return none();
  const st = parseStatus(await git(dir, ["status", "--porcelain=v1", "-b", "-z", "--untracked-files=all"], "git status"));
  // Dari folder project + --show-cdup (bukan --show-toplevel): git me-resolve symlink (/tmp → /private/tmp)
  // dan di Windows bisa beda huruf besar/kecil, sehingga path tidak cocok dengan path di Explorer.
  const cdup = (await git(dir, ["rev-parse", "--show-cdup"], "rev-parse")).trim();
  st.root = cdup ? path.resolve(dir, cdup) : dir;
  return st;
}

export async function gitStage(dir: string, paths: string[]) {
  await git(dir, paths.length ? ["add", "--", ...paths] : ["add", "-A"], "Stage");
}

export async function gitUnstage(dir: string, paths: string[]) {
  const hasHead = await git(dir, ["rev-parse", "--verify", "HEAD"], "rev-parse").then(
    () => true,
    () => false
  );
  const args = hasHead ? (paths.length ? ["reset", "-q", "HEAD", "--", ...paths] : ["reset", "-q"]) : paths.length ? ["rm", "-q", "--cached", "--", ...paths] : ["rm", "-r", "-q", "--cached", "."];
  await git(dir, args, "Unstage");
}

export async function gitDiscard(ctx: Ctx, dir: string, paths: string[], untracked: string[]) {
  if (paths.length) await git(dir, ["checkout", "-q", "--", ...paths], "Discard");
  for (const u of untracked) {
    const p = path.join(dir, u);
    if (isWithin(dir, p)) await ctx.trash(p);
  }
}

export async function gitCommit(dir: string, message: string, amend: boolean): Promise<string> {
  if (!message.trim() && !amend) throw new Error("Tulis pesan commit dulu.");
  const args = ["commit", "-q"];
  if (amend) args.push("--amend");
  if (message.trim()) args.push("-m", message);
  else if (amend) args.push("--no-edit");
  await git(dir, args, "Commit");
  return (await git(dir, ["rev-parse", "--short", "HEAD"], "rev-parse")).trim();
}

export async function gitPush(dir: string): Promise<string> {
  const hasUpstream = await git(dir, ["rev-parse", "--abbrev-ref", "@{u}"], "upstream").then(
    () => true,
    () => false
  );
  let r: Captured;
  if (hasUpstream) r = await runCapture("git", ["push"], { cwd: dir, env: gitEnv(), timeoutMs: NETWORK });
  else {
    const branch = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"], "branch")).trim();
    const remotes = (await git(dir, ["remote"], "remote")).split("\n").filter(Boolean);
    const remote = remotes.includes("origin") ? "origin" : remotes[0];
    if (!remote) throw new Error("Repo ini belum punya remote. Tambahkan dulu: git remote add origin <url>");
    r = await runCapture("git", ["push", "-u", remote, branch], { cwd: dir, env: gitEnv(), timeoutMs: NETWORK });
  }
  orErr(r, "Push");
  return (r.stdout + r.stderr).trim();
}

export async function gitPull(dir: string): Promise<string> {
  const r = await runCapture("git", ["pull", "--ff-only"], { cwd: dir, env: gitEnv(), timeoutMs: NETWORK });
  orErr(r, "Pull");
  return (r.stdout + r.stderr).trim();
}

export async function gitLog(dir: string, limit: number, all = false) {
  let out: string;
  try {
    out = await git(dir, ["log", `-n${Math.min(500, Math.max(1, limit))}`, ...(all ? ["--all", "--topo-order"] : []), "--format=%H%x1f%h%x1f%s%x1f%an%x1f%at%x1f%D%x1f%P%x1e"], "git log");
  } catch (e) {
    if (/does not have any commits|bad default revision/.test((e as Error).message)) return [];
    throw e;
  }
  return out
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, "").split("\x1f"))
    .filter((f) => f.length >= 6)
    .map((f) => ({ sha: f[0], short: f[1], subject: f[2], author: f[3], time_s: Number(f[4]) || 0, refs: f[5].trim(), parents: (f[6] ?? "").trim().split(" ").filter(Boolean) }));
}

export async function gitBranches(dir: string) {
  const out = await git(dir, ["branch", "--format=%(HEAD)%(refname:short)"], "git branch");
  let current = "";
  const local: string[] = [];
  for (const l of out.split("\n").filter(Boolean)) {
    if (l.startsWith("*")) {
      current = l.slice(1);
      local.push(current);
    } else local.push(l.trimStart());
  }
  return { current, local };
}

export async function gitCheckout(dir: string, branch: string, create: boolean, start?: string | null) {
  if (!validRef(branch)) throw new Error("Nama branch tidak valid.");
  if (start && !validSha(start) && !validRef(start)) throw new Error("Titik awal branch tidak valid.");
  await git(dir, create ? ["checkout", "-q", "-b", branch, ...(start ? [start] : [])] : ["checkout", "-q", branch], "Checkout");
}

/**
 * Clone repositori ke dalam folder `parent`. Hanya URL https://, ssh://, git@host:path, atau file://
 * yang diterima (tidak ada opsi git dari pengguna). Mengembalikan path folder hasil clone.
 */
export async function gitClone(url: string, parent: string): Promise<string> {
  const u = url.trim();
  if (!/^(https:\/\/|ssh:\/\/|git@[\w.-]+:|file:\/\/)[^\s]+$/.test(u)) throw new Error("URL repositori tidak valid. Pakai https://… atau git@host:user/repo.git");
  const name = (u.replace(/\/+$/, "").split(/[/:]/).pop() ?? "repo").replace(/\.git$/, "").replace(/[^\w.-]/g, "-") || "repo";
  let dest = path.join(parent, name);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(parent, `${name}-${i}`);
  await git(parent, ["clone", "--", u, dest], "git clone", 10 * 60_000);
  return dest;
}

export const gitInit = (dir: string) => git(dir, ["init", "-q"], "git init").then(() => undefined);

/** Isi berkas di HEAD; null kalau berkas baru atau bukan repo. Dijalankan dari folder berkas itu. */
export async function gitHeadContent(file: string): Promise<string | null> {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) return null;
  const r = await runCapture("git", ["show", `HEAD:./${path.basename(file)}`], { cwd: dir, env: gitEnv(), timeoutMs: SHORT });
  return r.success ? r.stdout : null;
}

export async function gitDiffFile(dir: string, file: string, staged: boolean) {
  return git(dir, ["diff", "--no-color", ...(staged ? ["--cached"] : []), "--", file], "git diff");
}

/** Git Bot: commit HANYA berkas yang baru disimpan, lalu (opsional) push. */
/** Nama berkas yang kelihatan seperti rahasia (.env, kunci, sertifikat). */
export function looksSecret(file: string): boolean {
  const name = path.basename(file).toLowerCase();
  return name.startsWith(".env") || name.endsWith(".pem") || name.endsWith(".key") || name.endsWith(".p12") || name.includes("secret") || name === "id_rsa" || name === "id_ed25519";
}

const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock", "poetry.lock", "Gemfile.lock", "composer.lock", "go.sum"];
const MAX_COMMIT_DIFF = 60_000;

/**
 * Bahan untuk pesan commit buatan AI: diff yang di-stage (atau semua perubahan bila belum ada yang
 * di-stage), tanpa lockfile & berkas rahasia, dipotong 60 KB; plus 5 subjek commit terakhir sebagai
 * contoh gaya penulisan.
 */
export async function gitCommitContext(dir: string): Promise<{ staged: boolean; files: string[]; diff: string; truncated: boolean; recent: string[] }> {
  const names = (args: string[]) => git(dir, ["diff", "--name-only", "-z", ...args], "diff").then((o) => o.split("\0").filter(Boolean));
  let staged = true;
  let files = await names(["--cached"]);
  const hasHead = await git(dir, ["rev-parse", "--verify", "HEAD"], "rev-parse").then(
    () => true,
    () => false
  );
  if (!files.length) {
    staged = false;
    files = hasHead ? await names(["HEAD"]) : [];
  }
  const untracked = staged ? [] : (await git(dir, ["ls-files", "--others", "--exclude-standard", "-z"], "ls-files")).split("\0").filter(Boolean);
  const exclude = [...LOCKFILES.map((f) => `:(exclude,glob)**/${f}`), ...files.filter(looksSecret).map((f) => `:(exclude,literal)${f}`)];
  let diff = "";
  if (files.length) {
    const base = staged ? ["diff", "--cached"] : hasHead ? ["diff", "HEAD"] : ["diff"];
    diff = await git(dir, [...base, "--no-color", "--no-ext-diff", "-U2", "--stat=120", "--patch", "--", ".", ...exclude], "diff", 30_000);
  }
  if (untracked.length) diff += `\n# Untracked files\n${untracked.filter((f) => !looksSecret(f)).map((f) => `+ ${f}`).join("\n")}\n`;
  const truncated = diff.length > MAX_COMMIT_DIFF;
  if (truncated) diff = diff.slice(0, MAX_COMMIT_DIFF);
  const recent = hasHead ? (await gitLog(dir, 5)).map((c) => c.subject) : [];
  return { staged, files: [...files, ...untracked], diff, truncated, recent };
}

export async function gitAutoCommitFile(dir: string, file: string, push: boolean): Promise<string> {
  const gitDir = path.resolve(dir, (await git(dir, ["rev-parse", "--git-dir"], "rev-parse")).trim());
  for (const m of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]) {
    if (fs.existsSync(path.join(gitDir, m))) throw new Error("Git Bot dilewati: sedang ada merge/rebase.");
  }
  if ((await git(dir, ["diff", "--name-only", "--diff-filter=U"], "diff")).trim()) throw new Error("Git Bot dilewati: masih ada konflik.");
  const name = path.basename(file).toLowerCase();
  if (looksSecret(name)) {
    throw new Error(`Git Bot tidak meng-commit ${name} karena kelihatan seperti berkas rahasia.`);
  }
  await git(dir, ["add", "--", file], "Stage");
  const quiet = await runCapture("git", ["diff", "--cached", "--quiet", "--", file], { cwd: dir, env: gitEnv(), timeoutMs: SHORT });
  if (quiet.success) return "Tidak ada perubahan untuk di-commit.";
  await git(dir, ["commit", "-q", "-m", `auto: perbarui ${path.basename(file)}`, "--", file], "Commit");
  const short = (await git(dir, ["rev-parse", "--short", "HEAD"], "rev-parse")).trim();
  if (!push) return `Commit ${short}`;
  const r = await runCapture("git", ["push"], { cwd: dir, env: gitEnv(), timeoutMs: NETWORK });
  if (!r.success) throw new Error(`Commit ${short} dibuat, tapi push gagal: ${r.stderr.trim()}`);
  return `Commit ${short} dan push berhasil`;
}

// ---------- Operasi lanjutan: stash, fetch, branch/tag, merge/rebase/cherry-pick, hunk, blame ----------

/** Nama ref aman: bukan opsi, tanpa `..`, spasi, atau karakter yang ditolak git. */
export function validRef(name: string): boolean {
  return /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[^\s~^:?*[\\\x00-\x1f\x7f]+$/.test(name) && !name.endsWith(".lock") && !name.endsWith("/") && !name.endsWith(".");
}
const validSha = (s: string) => /^[0-9a-f]{4,64}$/i.test(s);
const validStash = (s: string) => /^stash@\{\d{1,4}\}$/.test(s);
/** Tanpa editor interaktif: merge/rebase/cherry-pick --continue memakai pesan bawaan. */
const noEditor = () => ({ ...gitEnv(), GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" });

export interface StashEntry {
  ref: string;
  message: string;
  time_s: number;
}

export async function gitStashList(dir: string): Promise<StashEntry[]> {
  const out = await git(dir, ["stash", "list", "--format=%gd%x1f%gs%x1f%at"], "stash list");
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\x1f"))
    .map((f) => ({ ref: f[0], message: f[1] ?? "", time_s: Number(f[2]) || 0 }));
}

export async function gitStashPush(dir: string, message: string, untracked: boolean) {
  const args = ["stash", "push"];
  if (untracked) args.push("--include-untracked");
  if (message.trim()) args.push("-m", message.trim());
  const out = await git(dir, args, "Stash");
  if (/No local changes to save/i.test(out)) throw new Error("Tidak ada perubahan untuk di-stash.");
}

/** Terapkan stash; `pop` sekaligus membuangnya bila berhasil. Konflik dilaporkan, bukan dilempar. */
export async function gitStashApply(dir: string, ref: string, pop: boolean): Promise<OpResult> {
  if (!validStash(ref)) throw new Error("Stash tidak valid.");
  return opRun(dir, ["stash", pop ? "pop" : "apply", ref], pop ? "Stash pop" : "Stash apply");
}

export async function gitStashDrop(dir: string, ref: string) {
  if (!validStash(ref)) throw new Error("Stash tidak valid.");
  await git(dir, ["stash", "drop", ref], "Stash drop");
}

export async function gitFetch(dir: string): Promise<string> {
  const r = await runCapture("git", ["fetch", "--all", "--prune"], { cwd: dir, env: gitEnv(), timeoutMs: NETWORK });
  orErr(r, "Fetch");
  return (r.stdout + r.stderr).trim();
}

export async function gitBranchDelete(dir: string, name: string, force: boolean) {
  if (!validRef(name)) throw new Error("Nama branch tidak valid.");
  await git(dir, ["branch", force ? "-D" : "-d", "--", name], "Hapus branch");
}

export async function gitBranchRename(dir: string, from: string, to: string) {
  if (!validRef(from) || !validRef(to)) throw new Error("Nama branch tidak valid.");
  await git(dir, ["branch", "-m", from, to], "Ganti nama branch");
}

export async function gitRemoteBranches(dir: string): Promise<string[]> {
  const out = await git(dir, ["branch", "-r", "--format=%(refname:short)"], "git branch -r");
  return out.split("\n").map((l) => l.trim()).filter((l) => l && !l.endsWith("/HEAD"));
}

export interface TagEntry {
  name: string;
  sha: string;
  subject: string;
}

export async function gitTags(dir: string): Promise<TagEntry[]> {
  const out = await git(dir, ["tag", "--list", "--sort=-creatordate", "--format=%(refname:short)%1f%(objectname:short)%1f%(subject)"], "git tag");
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\x1f"))
    .map((f) => ({ name: f[0], sha: f[1] ?? "", subject: f[2] ?? "" }));
}

export async function gitTagCreate(dir: string, name: string, target: string | null, message: string) {
  if (!validRef(name)) throw new Error("Nama tag tidak valid.");
  if (target && !validSha(target) && !validRef(target)) throw new Error("Target tag tidak valid.");
  const args = ["tag"];
  if (message.trim()) args.push("-a", "-m", message.trim());
  args.push("--", name);
  if (target) args.push(target);
  await git(dir, args, "Buat tag");
}

export async function gitTagDelete(dir: string, name: string) {
  if (!validRef(name)) throw new Error("Nama tag tidak valid.");
  await git(dir, ["tag", "-d", name], "Hapus tag");
}

export type GitOp = "merge" | "rebase" | "cherry-pick" | "revert";

export interface OpResult {
  ok: boolean;
  /** Ada berkas konflik yang harus diselesaikan dulu. */
  conflicts: boolean;
  output: string;
}

async function conflictCount(dir: string): Promise<number> {
  return (await git(dir, ["diff", "--name-only", "--diff-filter=U"], "diff")).split("\n").filter(Boolean).length;
}

/** Jalankan operasi yang bisa berhenti di konflik: konflik bukan galat, melainkan status. */
async function opRun(dir: string, args: string[], what: string, timeoutMs = 60_000): Promise<OpResult> {
  const r = await runCapture("git", args, { cwd: dir, env: noEditor(), timeoutMs });
  const output = (r.stdout + r.stderr).trim();
  if (r.timedOut) throw new Error(`${what} terlalu lama dan dihentikan.`);
  if (r.success) return { ok: true, conflicts: false, output };
  const conflicts = (await conflictCount(dir)) > 0 || /CONFLICT/.test(output);
  if (conflicts) return { ok: false, conflicts: true, output };
  throw new Error(`${what} gagal: ${output}`);
}

/** Operasi yang sedang berjalan (berhenti karena konflik) dan jumlah berkas konflik. */
export async function gitOpState(dir: string): Promise<{ op: GitOp | null; conflicts: number }> {
  const gitDir = path.resolve(dir, (await git(dir, ["rev-parse", "--git-dir"], "rev-parse")).trim());
  const has = (f: string) => fs.existsSync(path.join(gitDir, f));
  const op: GitOp | null = has("rebase-merge") || has("rebase-apply") ? "rebase" : has("MERGE_HEAD") ? "merge" : has("CHERRY_PICK_HEAD") ? "cherry-pick" : has("REVERT_HEAD") ? "revert" : null;
  return { op, conflicts: op ? await conflictCount(dir) : 0 };
}

export async function gitMerge(dir: string, branch: string): Promise<OpResult> {
  if (!validRef(branch)) throw new Error("Nama branch tidak valid.");
  return opRun(dir, ["merge", "--no-edit", branch], "Merge");
}

export async function gitRebase(dir: string, onto: string): Promise<OpResult> {
  if (!validRef(onto)) throw new Error("Nama branch tidak valid.");
  return opRun(dir, ["rebase", onto], "Rebase", 120_000);
}

export async function gitCherryPick(dir: string, sha: string): Promise<OpResult> {
  if (!validSha(sha)) throw new Error("Commit tidak valid.");
  return opRun(dir, ["cherry-pick", sha], "Cherry-pick");
}

export async function gitRevertCommit(dir: string, sha: string): Promise<OpResult> {
  if (!validSha(sha)) throw new Error("Commit tidak valid.");
  return opRun(dir, ["revert", "--no-edit", sha], "Revert");
}

/** Lanjutkan operasi setelah konflik diselesaikan (berkas sudah di-stage). */
export async function gitOpContinue(dir: string): Promise<OpResult> {
  const { op, conflicts } = await gitOpState(dir);
  if (!op) throw new Error("Tidak ada merge/rebase yang sedang berjalan.");
  if (conflicts) return { ok: false, conflicts: true, output: `${conflicts} berkas masih konflik.` };
  if (op === "merge") return opRun(dir, ["commit", "--no-edit"], "Merge");
  return opRun(dir, [op, "--continue"], op);
}

export async function gitOpAbort(dir: string) {
  const { op } = await gitOpState(dir);
  if (!op) return;
  await git(dir, [op, "--abort"], `${op} --abort`);
}

/**
 * Terapkan patch (mis. satu bagian perubahan dari gutter) ke index (`cached`) atau ke berkas.
 * Patch dikirim lewat stdin dan dibatasi ukurannya.
 */
export async function gitApplyPatch(dir: string, patch: string, cached: boolean, reverse: boolean) {
  if (patch.length > 2_000_000) throw new Error("Patch terlalu besar.");
  if (!patch.startsWith("diff --git ")) throw new Error("Patch tidak valid.");
  const args = ["apply", "--unidiff-zero", "--whitespace=nowarn"];
  if (cached) args.push("--cached");
  if (reverse) args.push("--reverse");
  args.push("-");
  orErr(await runCapture("git", args, { cwd: dir, env: gitEnv(), timeoutMs: SHORT, input: patch }), "Terapkan patch");
}

export interface BlameCommit {
  sha: string;
  author: string;
  time_s: number;
  summary: string;
}

/** Blame `--porcelain` → commit unik + sha per baris (1-based di indeks 0). */
export function parseBlame(out: string): { commits: Record<string, BlameCommit>; lines: string[] } {
  const commits: Record<string, BlameCommit> = {};
  const lines: string[] = [];
  let cur: BlameCommit | null = null;
  let curLine = 0;
  for (const l of out.split("\n")) {
    const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(l);
    if (head) {
      cur = commits[head[1]] ??= { sha: head[1], author: "", time_s: 0, summary: "" };
      curLine = Number(head[2]);
      continue;
    }
    if (!cur) continue;
    if (l.startsWith("author ")) cur.author = l.slice(7);
    else if (l.startsWith("author-time ")) cur.time_s = Number(l.slice(12)) || 0;
    else if (l.startsWith("summary ")) cur.summary = l.slice(8);
    else if (l.startsWith("\t")) lines[curLine - 1] = cur.sha;
  }
  return { commits, lines };
}

/** Blame berkas (isi di disk). Berkas baru / bukan repo → null. */
export async function gitBlame(file: string): Promise<ReturnType<typeof parseBlame> | null> {
  const dir = path.dirname(file);
  if (!fs.existsSync(file)) return null;
  const r = await runCapture("git", ["blame", "--porcelain", "--", path.basename(file)], { cwd: dir, env: gitEnv(), timeoutMs: 30_000 });
  return r.success ? parseBlame(r.stdout) : null;
}

/** Isi satu commit untuk ditinjau: ringkasan + patch (dipotong). */
export async function gitShowCommit(dir: string, sha: string): Promise<{ text: string; truncated: boolean }> {
  if (!validSha(sha)) throw new Error("Commit tidak valid.");
  let text = await git(dir, ["show", "--no-color", "--no-ext-diff", "--diff-merges=first-parent", "--stat=120", "--patch", "--format=commit %H%nAuthor: %an <%ae>%nDate:   %ad%n%n%w(0,4,4)%B", sha], "git show", 30_000);
  const truncated = text.length > 400_000;
  if (truncated) text = text.slice(0, 400_000);
  return { text, truncated };
}
