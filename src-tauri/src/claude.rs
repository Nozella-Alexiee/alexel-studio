//! Jembatan ke Claude Code CLI resmi (langganan Pro/Max, tanpa API key).
//! Prompt dikirim lewat stdin (bukan argumen) supaya tidak kena batas panjang
//! argumen dan tidak terlihat di daftar proses. Output `stream-json` diteruskan
//! baris per baris ke frontend lewat event `claude-event`.

use crate::util::{augmented_path, blocking, run_capture};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const MAX_PROMPT_BYTES: usize = 400 * 1024;

#[derive(Default)]
pub struct ClaudeState {
    runs: Arc<Mutex<HashMap<String, Child>>>,
}

impl ClaudeState {
    pub fn kill_all(&self) {
        if let Ok(mut m) = self.runs.lock() {
            for (_, c) in m.iter_mut() {
                let _ = c.kill();
            }
            m.clear();
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct ClaudeInfo {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub fn find_claude() -> Option<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    for dir in augmented_path().split(':') {
        let p = Path::new(dir).join("claude");
        if p.is_file() {
            return Some(p);
        }
    }
    [format!("{home}/.claude/local/claude"), format!("{home}/.local/bin/claude")]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.is_file())
}

#[tauri::command]
pub async fn claude_detect() -> Result<ClaudeInfo, String> {
    blocking(|| {
        let Some(path) = find_claude() else {
            return Ok(ClaudeInfo {
                installed: false,
                path: None,
                version: None,
                error: Some("Claude Code CLI belum terpasang. Pasang: npm install -g @anthropic-ai/claude-code".into()),
            });
        };
        let mut c = Command::new(&path);
        c.arg("--version");
        let r = run_capture(c, Duration::from_secs(10))?;
        if r.success {
            Ok(ClaudeInfo {
                installed: true,
                path: Some(path.to_string_lossy().into()),
                version: Some(r.stdout.trim().to_string()),
                error: None,
            })
        } else {
            Ok(ClaudeInfo {
                installed: false,
                path: Some(path.to_string_lossy().into()),
                version: None,
                error: Some(format!(
                    "claude ditemukan tapi gagal jalan: {}",
                    if r.timed_out { "timeout".to_string() } else { r.stderr.trim().to_string() }
                )),
            })
        }
    })
    .await
}

#[derive(Serialize, Clone)]
struct ClaudeLine {
    run_id: String,
    line: String,
}

#[derive(Serialize, Clone)]
struct ClaudeDone {
    run_id: String,
    code: Option<i32>,
    stderr: String,
}

/// Mulai satu permintaan ke Claude. Hasil datang lewat event `claude-event`
/// (satu baris JSON per event) lalu `claude-done`.
#[tauri::command]
pub async fn claude_run(
    app: AppHandle,
    state: State<'_, ClaudeState>,
    run_id: String,
    project_dir: String,
    prompt: String,
    resume_session: Option<String>,
) -> Result<(), String> {
    if prompt.len() > MAX_PROMPT_BYTES {
        return Err("Konteks terlalu besar untuk dikirim (maks 400 KB). Kirim bagian yang lebih kecil.".into());
    }
    let cli = find_claude().ok_or("Claude Code CLI belum terpasang.")?;
    let dir = PathBuf::from(&project_dir);
    let mut cmd = Command::new(&cli);
    cmd.args(["-p", "--output-format", "stream-json", "--verbose"]);
    if let Some(s) = resume_session.filter(|s| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')) {
        cmd.args(["--resume", &s]);
    }
    if dir.is_dir() {
        cmd.current_dir(&dir);
    }
    cmd.env("PATH", augmented_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Gagal menjalankan claude: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let p = prompt.clone();
        std::thread::spawn(move || {
            let _ = stdin.write_all(p.as_bytes());
        });
    }
    let stdout = child.stdout.take().ok_or("stdout tidak tersedia")?;
    let mut stderr = child.stderr.take().ok_or("stderr tidak tersedia")?;
    state.runs.lock().map_err(|_| "State rusak")?.insert(run_id.clone(), child);

    let runs = state.runs.clone();
    std::thread::spawn(move || {
        let err_t = std::thread::spawn(move || {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s);
            s
        });
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let _ = app.emit("claude-event", ClaudeLine { run_id: run_id.clone(), line });
        }
        let code = runs
            .lock()
            .ok()
            .and_then(|mut m| m.remove(&run_id))
            .and_then(|mut c| c.wait().ok())
            .and_then(|s| s.code());
        let stderr = err_t.join().unwrap_or_default();
        let _ = app.emit("claude-done", ClaudeDone { run_id, code, stderr: stderr.chars().take(4000).collect() });
    });
    Ok(())
}

#[tauri::command]
pub async fn claude_cancel(state: State<'_, ClaudeState>, run_id: String) -> Result<(), String> {
    if let Some(c) = state.runs.lock().map_err(|_| "State rusak")?.get_mut(&run_id) {
        let _ = c.kill();
    }
    Ok(())
}
