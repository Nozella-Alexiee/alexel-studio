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

export async function gitLog(dir: string, limit: number) {
  let out: string;
  try {
    out = await git(dir, ["log", `-n${Math.min(500, Math.max(1, limit))}`, "--format=%H%x1f%h%x1f%s%x1f%an%x1f%at%x1f%D%x1e"], "git log");
  } catch (e) {
    if (/does not have any commits|bad default revision/.test((e as Error).message)) return [];
    throw e;
  }
  return out
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, "").split("\x1f"))
    .filter((f) => f.length >= 6)
    .map((f) => ({ sha: f[0], short: f[1], subject: f[2], author: f[3], time_s: Number(f[4]) || 0, refs: f[5].trim() }));
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

export async function gitCheckout(dir: string, branch: string, create: boolean) {
  if (!branch.trim() || branch.startsWith("-") || branch.includes("..")) throw new Error("Nama branch tidak valid.");
  await git(dir, create ? ["checkout", "-q", "-b", branch] : ["checkout", "-q", branch], "Checkout");
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
