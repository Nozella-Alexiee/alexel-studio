// Operasi Git lanjutan yang dipakai panel Git, tampilan commit, dan palette perintah:
// fetch, stash, merge/rebase/cherry-pick (dengan konflik), tag, branch, bagian perubahan (hunk).

import * as A from "./actions";
import { refreshHeads } from "../editor/documents";
import { api, errMsg } from "../lib/ipc";
import type { GitOpResult } from "../lib/types";
import { confirmDialog, getState, promptDialog, setState, toast } from "../state/store";
import { tl } from "../i18n";

export const repoDir = () => getState().git?.root || getState().root || "";

/** Pilih satu dari daftar lewat quick pick; null bila dibatalkan. */
export function pickOne(title: string, items: { label: string; description?: string }[]): Promise<number | null> {
  if (!items.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    getState().quickPick?.resolve(null);
    setState({ quickPick: { items, canPickMany: false, title, placeHolder: title, resolve: (r) => resolve(r?.[0] ?? null) } });
  });
}

const refValid = (v: string) => (/^(?!-)(?!.*\.\.)[^\s~^:?*[\\]+$/.test(v) && !v.endsWith(".lock") && !v.endsWith("/") ? null : tl("Nama tidak valid."));

async function step<T>(fn: () => Promise<T>, ok?: string): Promise<T | null> {
  try {
    const r = await fn();
    if (ok) toast(ok, "success");
    return r;
  } catch (e) {
    toast(errMsg(e), "error");
    return null;
  } finally {
    await A.refreshGit();
    refreshHeads();
  }
}

/** Hasil merge/rebase/cherry-pick/stash: konflik → arahkan ke berkas konflik. */
function reportOp(r: GitOpResult | null, ok: string) {
  if (!r) return;
  if (r.ok) toast(ok, "success");
  else if (r.conflicts) {
    toast(tl("Ada konflik. Selesaikan berkas bertanda !, stage, lalu klik Lanjutkan di panel Git."), "error");
    A.toggleSidebar("git");
  }
}

export async function fetchAll() {
  const dir = repoDir();
  if (dir) await step(() => api.gitFetch(dir), tl("Fetch selesai"));
}

export async function stashChanges() {
  const dir = repoDir();
  if (!dir) return;
  const msg = await promptDialog(tl("Stash perubahan"), { message: tl("Perubahan (termasuk berkas baru) disimpan sementara dan folder dikembalikan ke commit terakhir."), placeholder: tl("Pesan (opsional)"), validate: () => null });
  if (msg === null) return;
  await step(() => api.gitStashPush(dir, msg, true), tl("Perubahan di-stash"));
}

export async function applyStash(ref: string, pop: boolean) {
  const dir = repoDir();
  reportOp(await step(() => api.gitStashApply(dir, ref, pop)), pop ? tl("Stash diterapkan dan dibuang") : tl("Stash diterapkan"));
}

export async function popLatestStash() {
  const dir = repoDir();
  if (!dir) return;
  const list = await api.gitStashList(dir).catch(() => []);
  if (!list.length) return toast(tl("Tidak ada stash."));
  await applyStash(list[0].ref, true);
}

export async function dropStash(ref: string) {
  if (!(await confirmDialog(tl("Buang {ref}?", { ref }), tl("Isi stash ini hilang permanen."), tl("Buang"), true))) return;
  await step(() => api.gitStashDrop(repoDir(), ref), tl("Stash dibuang"));
}

async function pickBranch(title: string, includeRemote: boolean): Promise<string | null> {
  const dir = repoDir();
  const b = await api.gitBranches(dir).catch(() => null);
  if (!b) return null;
  const remote = includeRemote ? await api.gitRemoteBranches(dir).catch(() => []) : [];
  const names = [...b.local.filter((n) => n !== b.current), ...remote];
  if (!names.length) {
    toast(tl("Tidak ada branch lain."));
    return null;
  }
  const i = await pickOne(title, names.map((n) => ({ label: n, description: remote.includes(n) ? tl("remote") : undefined })));
  return i === null ? null : names[i];
}

export async function mergeBranch() {
  const cur = getState().git?.branch ?? "HEAD";
  const name = await pickBranch(tl("Merge branch ke {branch}", { branch: cur }), true);
  if (name) reportOp(await step(() => api.gitMerge(repoDir(), name)), tl("{name} di-merge ke {branch}", { name, branch: cur }));
}

export async function rebaseBranch() {
  const cur = getState().git?.branch ?? "HEAD";
  const name = await pickBranch(tl("Rebase {branch} ke atas…", { branch: cur }), true);
  if (!name) return;
  if (!(await confirmDialog(tl("Rebase {branch} ke {name}?", { branch: cur, name }), tl("Commit di {branch} ditulis ulang di atas {name}. Jangan lakukan pada branch yang sudah dipakai orang lain.", { branch: cur, name }), tl("Rebase")))) return;
  reportOp(await step(() => api.gitRebase(repoDir(), name)), tl("Rebase selesai"));
}

export async function cherryPick(sha: string, subject: string) {
  if (!(await confirmDialog(tl("Cherry-pick commit ini?"), subject, tl("Cherry-pick")))) return;
  reportOp(await step(() => api.gitCherryPick(repoDir(), sha)), tl("Commit diterapkan"));
}

export async function revertCommit(sha: string, subject: string) {
  if (!(await confirmDialog(tl("Revert commit ini?"), tl("Commit baru dibuat yang membatalkan: {subject}", { subject }), tl("Revert")))) return;
  reportOp(await step(() => api.gitRevertCommit(repoDir(), sha)), tl("Commit di-revert"));
}

export async function continueOp() {
  reportOp(await step(() => api.gitOpContinue(repoDir())), tl("Selesai"));
}

export async function abortOp() {
  if (!(await confirmDialog(tl("Batalkan operasi git?"), tl("Folder dikembalikan ke keadaan sebelum merge/rebase/cherry-pick dimulai."), tl("Batalkan operasi"), true))) return;
  await step(() => api.gitOpAbort(repoDir()), tl("Dibatalkan"));
}

export async function createBranch(start: string | null = null) {
  const n = await promptDialog(tl("Branch baru"), { placeholder: tl("fitur/nama"), validate: refValid });
  if (n) await step(() => api.gitCheckout(repoDir(), n, true, start), tl("Branch {name} dibuat", { name: n }));
}

export async function renameBranch() {
  const cur = getState().git?.branch;
  if (!cur) return;
  const n = await promptDialog(tl("Ganti nama branch {name}", { name: cur }), { defaultValue: cur, validate: refValid });
  if (n && n !== cur) await step(() => api.gitBranchRename(repoDir(), cur, n), tl("Branch diganti nama"));
}

export async function deleteBranch() {
  const name = await pickBranch(tl("Hapus branch"), false);
  if (!name) return;
  if (!(await confirmDialog(tl("Hapus branch {name}?", { name }), tl("Branch yang belum di-merge ikut terhapus beserta commit-nya yang tidak ada di branch lain."), tl("Hapus"), true))) return;
  await step(() => api.gitBranchDelete(repoDir(), name, true), tl("Branch {name} dihapus", { name }));
}

export async function createTag(target: string | null = null) {
  const name = await promptDialog(tl("Tag baru"), { placeholder: "v1.0.0", validate: refValid });
  if (!name) return;
  const message = await promptDialog(tl("Pesan tag (opsional)"), { message: tl("Kosongkan untuk tag ringan."), validate: () => null });
  if (message === null) return;
  await step(() => api.gitTagCreate(repoDir(), name, target, message), tl("Tag {name} dibuat", { name }));
}

export async function deleteTag() {
  const dir = repoDir();
  const tags = await api.gitTags(dir).catch(() => []);
  if (!tags.length) return toast(tl("Belum ada tag."));
  const i = await pickOne(tl("Hapus tag"), tags.map((t) => ({ label: t.name, description: t.subject })));
  if (i === null) return;
  await step(() => api.gitTagDelete(dir, tags[i].name), tl("Tag {name} dihapus", { name: tags[i].name }));
}
