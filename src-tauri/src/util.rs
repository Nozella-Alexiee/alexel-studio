//! Helper kecil yang dipakai semua modul: PATH macOS, quoting shell,
//! dan menjalankan proses dengan batas waktu supaya UI tidak pernah macet.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// PATH dari shell login+interaktif pengguna (membaca .zprofile dan .zshrc, jadi nvm,
/// pyenv, volta ikut). Diambil sekali dengan batas waktu 4 detik.
fn shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut c = Command::new(&shell);
    c.args(["-ilc", "printf '__NOZEL_PATH__%s__END__' \"$PATH\""]);
    c.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = c.spawn().ok()?;
    let mut out = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut s = String::new();
        let _ = out.read_to_string(&mut s);
        s
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() > Duration::from_secs(4) => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(_) => break,
        }
    }
    let s = reader.join().ok()?;
    let a = s.find("__NOZEL_PATH__")? + "__NOZEL_PATH__".len();
    let b = s[a..].find("__END__")? + a;
    Some(s[a..b].to_string())
}

/// Panaskan cache PATH di thread latar supaya perintah pertama tidak menunggu.
pub fn warm_path() {
    thread::spawn(|| {
        let _ = augmented_path();
    });
}

/// PATH yang dipakai aplikasi GUI macOS sering kali minim (tanpa Homebrew, Cargo, dsb).
/// Urutan: PATH shell pengguna dulu (pilihan nvm/pyenv dihormati), baru lokasi umum.
/// Entri kosong atau relatif dibuang supaya `./node` dari repo tidak ikut terpanggil.
pub fn augmented_path() -> String {
    static CACHE: OnceLock<String> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let home = std::env::var("HOME").unwrap_or_default();
            let mut parts: Vec<String> = Vec::new();
            let mut push = |p: String| {
                if p.starts_with('/') && !parts.contains(&p) {
                    parts.push(p);
                }
            };
            for p in shell_path().unwrap_or_default().split(':') {
                push(p.to_string());
            }
            for p in [
                format!("{home}/.local/bin"),
                format!("{home}/.claude/local"),
                "/opt/homebrew/bin".into(),
                "/opt/homebrew/sbin".into(),
                "/usr/local/bin".into(),
                format!("{home}/.cargo/bin"),
                format!("{home}/.bun/bin"),
                format!("{home}/.deno/bin"),
                format!("{home}/go/bin"),
                format!("{home}/.npm-global/bin"),
                format!("{home}/Library/pnpm"),
                format!("{home}/.composer/vendor/bin"),
                format!("{home}/.volta/bin"),
                format!("{home}/.pyenv/shims"),
                "/usr/local/go/bin".into(),
                "/usr/bin".into(),
                "/bin".into(),
                "/usr/sbin".into(),
                "/sbin".into(),
            ] {
                push(p);
            }
            for p in std::env::var("PATH").unwrap_or_default().split(':') {
                push(p.to_string());
            }
            parts.join(":")
        })
        .clone()
}

/// Quote satu argumen untuk shell POSIX dengan aman: 'a'\''b'.
pub fn shell_quote(s: &str) -> String {
    if !s.is_empty()
        && s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "/._-+=:,@%".contains(c))
    {
        return s.to_string();
    }
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[allow(dead_code)]
pub struct Captured {
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    pub success: bool,
    pub timed_out: bool,
    pub elapsed_ms: u64,
}

/// Jalankan proses dan tunggu hasilnya, tapi bunuh bila melewati `timeout`.
/// stdin selalu ditutup supaya program yang minta input tidak menggantung.
pub fn run_capture(mut cmd: Command, timeout: Duration) -> Result<Captured, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", augmented_path());
    let start = Instant::now();
    let mut child = cmd.spawn().map_err(|e| format!("Gagal menjalankan proses: {e}"))?;

    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_t = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = out_pipe.as_mut() {
            let _ = p.read_to_end(&mut buf);
        }
        buf
    });
    let err_t = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = err_pipe.as_mut() {
            let _ = p.read_to_end(&mut buf);
        }
        buf
    });

    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break Some(s),
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    timed_out = true;
                    break child.wait().ok();
                }
                thread::sleep(Duration::from_millis(15));
            }
            Err(_) => break None,
        }
    };

    let stdout = String::from_utf8_lossy(&out_t.join().unwrap_or_default()).to_string();
    let stderr = String::from_utf8_lossy(&err_t.join().unwrap_or_default()).to_string();
    Ok(Captured {
        stdout,
        stderr,
        code: status.and_then(|s| s.code()),
        success: status.map(|s| s.success()).unwrap_or(false) && !timed_out,
        timed_out,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

/// `git` dengan prompt kredensial dimatikan supaya tidak pernah menunggu input.
pub fn git(dir: &Path) -> Command {
    let mut c = Command::new("git");
    c.current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=15")
        .env("LC_ALL", "C");
    c
}

/// Tolak path yang mengandung komponen `..` (mencegah nama berkas "../../x" keluar folder).
pub fn ensure_clean_path(p: &Path) -> Result<(), String> {
    if !p.is_absolute() {
        return Err("Path harus absolut.".into());
    }
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Path tidak boleh mengandung '..'.".into());
    }
    Ok(())
}

/// Jalankan pekerjaan berat di thread pool blocking Tauri, bukan di main thread.
pub async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Tugas latar belakang gagal: {e}"))?
}

/// Nama folder yang hampir selalu berat dan tidak perlu dipindai.
pub const HEAVY_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    "Pods",
    ".turbo",
    ".cache",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_plain_and_special() {
        assert_eq!(shell_quote("/usr/bin/node"), "/usr/bin/node");
        assert_eq!(shell_quote("a b"), "'a b'");
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
        assert_eq!(shell_quote("$(rm -rf ~)"), "'$(rm -rf ~)'");
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn capture_times_out() {
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "sleep 5"]);
        let r = run_capture(c, Duration::from_millis(200)).unwrap();
        assert!(r.timed_out);
        assert!(!r.success);
    }

    #[test]
    fn capture_closes_stdin() {
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "read x; echo got:$x"]);
        let r = run_capture(c, Duration::from_secs(5)).unwrap();
        assert!(!r.timed_out);
        assert!(r.stdout.contains("got:"));
    }
}
