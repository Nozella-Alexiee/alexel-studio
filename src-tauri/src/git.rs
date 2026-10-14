//! Git lengkap lewat CLI `git`: status, stage/unstage, discard, commit, push/pull,
//! riwayat, branch, dan isi berkas di HEAD (untuk gutter diff di editor).
//! Semua perintah punya batas waktu dan prompt kredensial dimatikan.

use crate::util::{blocking, git, run_capture};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

const SHORT: Duration = Duration::from_secs(15);
const NETWORK: Duration = Duration::from_secs(90);

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct GitFile {
    pub path: String,
    pub orig_path: Option<String>,
    /// Kode status dua huruf porcelain (index, worktree), mis. "M ", " M", "??", "A ".
    pub xy: String,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub conflicted: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct GitStatus {
    pub is_repo: bool,
    /// Folder akar repo; path di `files` relatif terhadap folder ini.
    pub root: String,
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFile>,
}

impl GitStatus {
    fn none() -> Self {
        GitStatus { is_repo: false, root: String::new(), branch: String::new(), upstream: None, ahead: 0, behind: 0, files: vec![] }
    }
}

fn ok_or_err(c: crate::util::Captured, what: &str) -> Result<String, String> {
    if c.timed_out {
        return Err(format!("{what} terlalu lama dan dihentikan."));
    }
    if c.success {
        Ok(c.stdout)
    } else {
        let msg = if c.stderr.trim().is_empty() { c.stdout } else { c.stderr };
        Err(format!("{what} gagal: {}", msg.trim()))
    }
}

fn run(dir: &Path, args: &[&str], timeout: Duration, what: &str) -> Result<String, String> {
    let mut c = git(dir);
    c.args(args);
    ok_or_err(run_capture(c, timeout)?, what)
}

/// Parse keluaran `git status --porcelain=v1 -b -z`.
pub fn parse_status(out: &str) -> GitStatus {
    let mut st = GitStatus::none();
    st.is_repo = true;
    let mut parts = out.split('\0').filter(|s| !s.is_empty()).peekable();
    while let Some(entry) = parts.next() {
        if let Some(head) = entry.strip_prefix("## ") {
            parse_branch_line(head, &mut st);
            continue;
        }
        if entry.len() < 4 {
            continue;
        }
        let xy = &entry[..2];
        let path = entry[3..].to_string();
        let (x, y) = (xy.as_bytes()[0] as char, xy.as_bytes()[1] as char);
        let orig_path = if x == 'R' || x == 'C' { parts.next().map(|s| s.to_string()) } else { None };
        let untracked = xy == "??";
        let conflicted = matches!(xy, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU");
        st.files.push(GitFile {
            path,
            orig_path,
            xy: xy.to_string(),
            staged: !untracked && !conflicted && x != ' ',
            unstaged: untracked || conflicted || y != ' ',
            untracked,
            conflicted,
        });
    }
    st
}

fn parse_branch_line(head: &str, st: &mut GitStatus) {
    // Contoh: "main...origin/main [ahead 1, behind 2]", "No commits yet on main", "HEAD (no branch)"
    let (names, track) = match head.find(" [") {
        Some(i) => (&head[..i], Some(&head[i + 2..head.len().saturating_sub(1)])),
        None => (head, None),
    };
    let names = names.trim_start_matches("No commits yet on ").trim_start_matches("Initial commit on ");
    match names.split_once("...") {
        Some((b, u)) => {
            st.branch = b.to_string();
            st.upstream = Some(u.to_string());
        }
        None => st.branch = names.to_string(),
    }
    if let Some(t) = track {
        for piece in t.split(", ") {
            if let Some(n) = piece.strip_prefix("ahead ") {
                st.ahead = n.parse().unwrap_or(0);
            } else if let Some(n) = piece.strip_prefix("behind ") {
                st.behind = n.parse().unwrap_or(0);
            }
        }
    }
}

fn is_repo(dir: &Path) -> bool {
    let mut c = git(dir);
    c.args(["rev-parse", "--is-inside-work-tree"]);
    run_capture(c, SHORT).map(|r| r.success && r.stdout.trim() == "true").unwrap_or(false)
}

#[tauri::command]
pub async fn git_status(project_dir: String) -> Result<GitStatus, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        if !dir.is_dir() || !is_repo(&dir) {
            return Ok(GitStatus::none());
        }
        let out = run(&dir, &["status", "--porcelain=v1", "-b", "-z", "--untracked-files=all"], SHORT, "git status")?;
        let mut st = parse_status(&out);
        st.root = run(&dir, &["rev-parse", "--show-toplevel"], SHORT, "rev-parse")?.trim().to_string();
        Ok(st)
    })
    .await
}

fn with_paths<'a>(base: &[&'a str], paths: &'a [String]) -> Vec<&'a str> {
    let mut v: Vec<&str> = base.to_vec();
    v.push("--");
    v.extend(paths.iter().map(|s| s.as_str()));
    v
}

#[tauri::command]
pub async fn git_stage(project_dir: String, paths: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let args = if paths.is_empty() { vec!["add", "-A"] } else { with_paths(&["add"], &paths) };
        run(&dir, &args, SHORT, "Stage").map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn git_unstage(project_dir: String, paths: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        // Repo tanpa commit belum punya HEAD; pakai rm --cached.
        let has_head = run(&dir, &["rev-parse", "--verify", "HEAD"], SHORT, "rev-parse").is_ok();
        let args = match (has_head, paths.is_empty()) {
            (true, true) => vec!["reset", "-q"],
            (true, false) => with_paths(&["reset", "-q", "HEAD"], &paths),
            (false, true) => vec!["rm", "-r", "-q", "--cached", "."],
            (false, false) => with_paths(&["rm", "-q", "--cached"], &paths),
        };
        run(&dir, &args, SHORT, "Unstage").map(|_| ())
    })
    .await
}

/// Buang perubahan. Berkas untracked dipindah ke Trash, bukan dihapus permanen.
#[tauri::command]
pub async fn git_discard(project_dir: String, paths: Vec<String>, untracked: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        if !paths.is_empty() {
            run(&dir, &with_paths(&["checkout", "-q"], &paths), SHORT, "Discard")?;
        }
        for u in untracked {
            let p = dir.join(&u);
            if p.starts_with(&dir) {
                trash::delete(&p).map_err(|e| format!("Gagal memindahkan {u} ke Trash: {e}"))?;
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_commit(project_dir: String, message: String, amend: bool) -> Result<String, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        if message.trim().is_empty() && !amend {
            return Err("Tulis pesan commit dulu.".into());
        }
        let mut args = vec!["commit", "-q"];
        if amend {
            args.push("--amend");
            if message.trim().is_empty() {
                args.push("--no-edit");
            }
        }
        if !message.trim().is_empty() {
            args.push("-m");
            args.push(&message);
        }
        run(&dir, &args, SHORT, "Commit")?;
        run(&dir, &["rev-parse", "--short", "HEAD"], SHORT, "rev-parse").map(|s| s.trim().to_string())
    })
    .await
}

#[tauri::command]
pub async fn git_push(project_dir: String) -> Result<String, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let has_upstream = run(&dir, &["rev-parse", "--abbrev-ref", "@{u}"], SHORT, "upstream").is_ok();
        let out = if has_upstream {
            let mut c = git(&dir);
            c.args(["push"]);
            run_capture(c, NETWORK)?
        } else {
            let branch = run(&dir, &["rev-parse", "--abbrev-ref", "HEAD"], SHORT, "branch")?;
            let remotes = run(&dir, &["remote"], SHORT, "remote")?;
            let remote = remotes.lines().find(|r| *r == "origin").or_else(|| remotes.lines().next());
            let Some(remote) = remote else {
                return Err("Repo ini belum punya remote. Tambahkan dulu: git remote add origin <url>".into());
            };
            let mut c = git(&dir);
            c.args(["push", "-u", remote, branch.trim()]);
            run_capture(c, NETWORK)?
        };
        let text = format!("{}{}", out.stdout, out.stderr);
        ok_or_err(out, "Push").map(|_| text.trim().to_string())
    })
    .await
}

#[tauri::command]
pub async fn git_pull(project_dir: String) -> Result<String, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let mut c = git(&dir);
        c.args(["pull", "--ff-only"]);
        let out = run_capture(c, NETWORK)?;
        let text = format!("{}{}", out.stdout, out.stderr);
        ok_or_err(out, "Pull").map(|_| text.trim().to_string())
    })
    .await
}

#[derive(Serialize, Clone, Debug)]
pub struct Commit {
    pub sha: String,
    pub short: String,
    pub subject: String,
    pub author: String,
    pub time_s: i64,
    pub refs: String,
}

#[tauri::command]
pub async fn git_log(project_dir: String, limit: u32) -> Result<Vec<Commit>, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let n = format!("-n{}", limit.clamp(1, 500));
        let out = match run(&dir, &["log", &n, "--format=%H%x1f%h%x1f%s%x1f%an%x1f%at%x1f%D%x1e"], SHORT, "git log") {
            Ok(o) => o,
            Err(e) if e.contains("does not have any commits") || e.contains("bad default revision") => return Ok(vec![]),
            Err(e) => return Err(e),
        };
        Ok(out
            .split('\x1e')
            .filter_map(|rec| {
                let f: Vec<&str> = rec.trim_start_matches('\n').split('\x1f').collect();
                if f.len() < 6 {
                    return None;
                }
                Some(Commit {
                    sha: f[0].into(),
                    short: f[1].into(),
                    subject: f[2].into(),
                    author: f[3].into(),
                    time_s: f[4].parse().unwrap_or(0),
                    refs: f[5].trim().into(),
                })
            })
            .collect())
    })
    .await
}

#[derive(Serialize, Clone, Debug)]
pub struct Branches {
    pub current: String,
    pub local: Vec<String>,
}

#[tauri::command]
pub async fn git_branches(project_dir: String) -> Result<Branches, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let out = run(&dir, &["branch", "--format=%(HEAD)%(refname:short)"], SHORT, "git branch")?;
        let mut current = String::new();
        let mut local = vec![];
        for l in out.lines() {
            if let Some(b) = l.strip_prefix('*') {
                current = b.to_string();
                local.push(b.to_string());
            } else {
                local.push(l.trim_start().to_string());
            }
        }
        Ok(Branches { current, local })
    })
    .await
}

#[tauri::command]
pub async fn git_checkout(project_dir: String, branch: String, create: bool) -> Result<(), String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        if branch.starts_with('-') || branch.contains("..") || branch.trim().is_empty() {
            return Err("Nama branch tidak valid.".into());
        }
        let args = if create { vec!["checkout", "-q", "-b", branch.as_str()] } else { vec!["checkout", "-q", branch.as_str()] };
        run(&dir, &args, SHORT, "Checkout").map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn git_init(project_dir: String) -> Result<(), String> {
    blocking(move || run(Path::new(&project_dir), &["init", "-q"], SHORT, "git init").map(|_| ())).await
}

/// Isi berkas di HEAD (None kalau berkas baru / bukan repo). Dipakai untuk gutter diff.
#[tauri::command]
pub async fn git_head_content(project_dir: String, path: String) -> Result<Option<String>, String> {
    blocking(move || {
        let p = Path::new(&path);
        // Jalankan dari folder berkas itu sendiri; "HEAD:./nama" relatif terhadap cwd,
        // jadi tetap benar walau project yang dibuka adalah subfolder repo.
        let Some(dir) = p.parent().filter(|d| d.is_dir()).map(Path::to_path_buf) else { return Ok(None) };
        let _ = &project_dir;
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let spec = format!("HEAD:./{name}");
        let mut c = git(&dir);
        c.args(["show", &spec]);
        let r = run_capture(c, SHORT)?;
        Ok(if r.success { Some(r.stdout) } else { None })
    })
    .await
}

/// Diff satu berkas (staged atau tidak) sebagai teks unified, untuk ditampilkan.
#[tauri::command]
pub async fn git_diff_file(project_dir: String, path: String, staged: bool) -> Result<String, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let mut args = vec!["diff", "--no-color"];
        if staged {
            args.push("--cached");
        }
        args.push("--");
        args.push(&path);
        run(&dir, &args, SHORT, "git diff")
    })
    .await
}

/// Mode "Git Bot" (opsional, default mati): commit HANYA berkas yang baru disimpan,
/// lalu push. Menolak saat merge/rebase berjalan, ada konflik, atau berkas mirip rahasia.
#[tauri::command]
pub async fn git_auto_commit_file(project_dir: String, path: String, push: bool) -> Result<String, String> {
    blocking(move || {
        let dir = PathBuf::from(&project_dir);
        let git_dir = run(&dir, &["rev-parse", "--git-dir"], SHORT, "rev-parse")?;
        let git_dir = dir.join(git_dir.trim());
        for marker in ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"] {
            if git_dir.join(marker).exists() {
                return Err("Git Bot dilewati: sedang ada merge/rebase.".into());
            }
        }
        if !run(&dir, &["diff", "--name-only", "--diff-filter=U"], SHORT, "diff")?.trim().is_empty() {
            return Err("Git Bot dilewati: masih ada konflik.".into());
        }
        let name = Path::new(&path).file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
        if name.starts_with(".env") || name.ends_with(".pem") || name.ends_with(".key") || name.contains("secret") || name == "id_rsa" {
            return Err(format!("Git Bot tidak meng-commit {name} karena kelihatan seperti berkas rahasia."));
        }
        run(&dir, &["add", "--", &path], SHORT, "Stage")?;
        // Tidak ada yang berubah setelah stage → tidak perlu commit.
        let mut c = git(&dir);
        c.args(["diff", "--cached", "--quiet", "--", &path]);
        if run_capture(c, SHORT)?.success {
            return Ok("Tidak ada perubahan untuk di-commit.".into());
        }
        let msg = format!("auto: perbarui {}", Path::new(&path).file_name().map(|n| n.to_string_lossy()).unwrap_or_default());
        run(&dir, &["commit", "-q", "-m", &msg, "--", &path], SHORT, "Commit")?;
        let short = run(&dir, &["rev-parse", "--short", "HEAD"], SHORT, "rev-parse")?.trim().to_string();
        if !push {
            return Ok(format!("Commit {short}"));
        }
        let mut c = git(&dir);
        c.args(["push"]);
        let r = run_capture(c, NETWORK)?;
        if r.success {
            Ok(format!("Commit {short} dan push berhasil"))
        } else {
            Err(format!("Commit {short} dibuat, tapi push gagal: {}", r.stderr.trim()))
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_and_files() {
        let out = "## main...origin/main [ahead 2, behind 1]\0 M src/a.ts\0A  new.rs\0?? notes.md\0R  b.rs\0old.rs\0UU conflict.txt\0";
        let s = parse_status(out);
        assert_eq!(s.branch, "main");
        assert_eq!(s.upstream.as_deref(), Some("origin/main"));
        assert_eq!((s.ahead, s.behind), (2, 1));
        assert_eq!(s.files.len(), 5);
        assert!(s.files[0].unstaged && !s.files[0].staged);
        assert!(s.files[1].staged && !s.files[1].unstaged);
        assert!(s.files[2].untracked);
        assert_eq!(s.files[3].orig_path.as_deref(), Some("old.rs"));
        assert!(s.files[4].conflicted);
    }

    #[test]
    fn parses_fresh_repo() {
        let s = parse_status("## No commits yet on main\0?? a\0");
        assert_eq!(s.branch, "main");
        assert_eq!(s.files.len(), 1);
    }

    #[test]
    fn non_repo_is_detected() {
        let d = std::env::temp_dir().join(format!("nozel_git_none_{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        assert!(!is_repo(&d) || d.ancestors().any(|a| a.join(".git").exists()));
    }

    #[test]
    fn stage_commit_flow() {
        let d = std::env::temp_dir().join(format!("nozel_git_flow_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        run(&d, &["init", "-q"], SHORT, "init").unwrap();
        run(&d, &["config", "user.email", "t@t"], SHORT, "cfg").unwrap();
        run(&d, &["config", "user.name", "t"], SHORT, "cfg").unwrap();
        std::fs::write(d.join("a.txt"), "1").unwrap();
        run(&d, &["add", "-A"], SHORT, "add").unwrap();
        let st = parse_status(&run(&d, &["status", "--porcelain=v1", "-b", "-z"], SHORT, "st").unwrap());
        assert!(st.files[0].staged);
        run(&d, &["commit", "-q", "-m", "x"], SHORT, "commit").unwrap();
        let st = parse_status(&run(&d, &["status", "--porcelain=v1", "-b", "-z"], SHORT, "st").unwrap());
        assert!(st.files.is_empty());
    }
}
