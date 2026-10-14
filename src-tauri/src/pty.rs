//! Terminal sungguhan (PTY). Tiap sesi punya shell login sendiri; output dikirim
//! ke frontend lewat event `pty-data`, dan `pty-exit` saat proses selesai.

use crate::util::augmented_path;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<u32, Session>>>,
    next: AtomicU32,
}

impl PtyState {
    pub fn kill_all(&self) {
        if let Ok(mut map) = self.sessions.lock() {
            for (_, s) in map.iter_mut() {
                let _ = s.child.kill();
            }
            map.clear();
        }
    }
}

#[derive(Serialize, Clone)]
struct DataEvent {
    id: u32,
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent {
    id: u32,
    code: Option<u32>,
    elapsed_ms: u64,
}

fn default_shell() -> String {
    std::env::var("SHELL").ok().filter(|s| std::path::Path::new(s).exists()).unwrap_or_else(|| "/bin/zsh".into())
}

/// Pecah byte jadi string UTF-8 tanpa memotong karakter multi-byte di tengah.
pub fn decode_chunk(carry: &mut Vec<u8>, chunk: &[u8]) -> String {
    carry.extend_from_slice(chunk);
    let mut out = String::new();
    loop {
        match std::str::from_utf8(carry) {
            Ok(s) => {
                out.push_str(s);
                carry.clear();
                break;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(std::str::from_utf8(&carry[..valid]).unwrap_or(""));
                match e.error_len() {
                    None => {
                        carry.drain(..valid);
                        break;
                    }
                    Some(n) => {
                        out.push('\u{FFFD}');
                        carry.drain(..valid + n);
                    }
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    cwd: String,
    cols: u16,
    rows: u16,
    command: Option<String>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("Gagal membuka terminal: {e}"))?;

    let shell = default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    if let Some(c) = command.as_ref().filter(|c| !c.trim().is_empty()) {
        cmd.arg("-c");
        cmd.arg(c);
    }
    let dir = std::path::Path::new(&cwd);
    cmd.cwd(if dir.is_dir() { cwd.clone() } else { std::env::var("HOME").unwrap_or_else(|_| "/".into()) });
    cmd.env("PATH", augmented_path());
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "NozelCode");
    if std::env::var("LANG").is_err() {
        cmd.env("LANG", "en_US.UTF-8");
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("Gagal menjalankan shell: {e}"))?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = state.next.fetch_add(1, Ordering::SeqCst) + 1;
    state
        .sessions
        .lock()
        .map_err(|_| "State terminal rusak.")?
        .insert(id, Session { master: pair.master, writer, child });

    let sessions = state.sessions.clone();
    let started = Instant::now();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut carry = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = decode_chunk(&mut carry, &buf[..n]);
                    if !data.is_empty() {
                        let _ = app.emit("pty-data", DataEvent { id, data });
                    }
                }
            }
        }
        let code = sessions
            .lock()
            .ok()
            .and_then(|mut m| m.remove(&id))
            .and_then(|mut s| s.child.wait().ok())
            .map(|st| st.exit_code());
        let _ = app.emit("pty-exit", ExitEvent { id, code, elapsed_ms: started.elapsed().as_millis() as u64 });
    });

    Ok(id)
}

#[tauri::command]
pub async fn pty_write(state: State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut map = state.sessions.lock().map_err(|_| "State terminal rusak.")?;
    let s = map.get_mut(&id).ok_or("Terminal sudah ditutup.")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pty_resize(state: State<'_, PtyState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.sessions.lock().map_err(|_| "State terminal rusak.")?;
    if let Some(s) = map.get(&id) {
        s.master
            .resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_kill(state: State<'_, PtyState>, id: u32) -> Result<(), String> {
    let mut map = state.sessions.lock().map_err(|_| "State terminal rusak.")?;
    if let Some(s) = map.get_mut(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_keeps_split_multibyte() {
        let mut carry = Vec::new();
        let bytes = "halo ✓".as_bytes();
        let (a, b) = bytes.split_at(bytes.len() - 1);
        assert_eq!(decode_chunk(&mut carry, a), "halo ");
        assert_eq!(decode_chunk(&mut carry, b), "✓");
        assert!(carry.is_empty());
    }

    #[test]
    fn decode_replaces_invalid() {
        let mut carry = Vec::new();
        assert_eq!(decode_chunk(&mut carry, &[b'a', 0xff, b'b']), "a\u{FFFD}b");
    }
}
