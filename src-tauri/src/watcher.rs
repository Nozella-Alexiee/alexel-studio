//! Memantau folder project (FSEvents) supaya perubahan dari luar — git pull,
//! formatter, Claude CLI — langsung muncul di tree dan editor.
//! Event dikumpulkan dulu (debounce) lalu dikirim sebagai `fs-changed`.

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState {
    current: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize, Clone, Debug)]
struct FsChanged {
    root: String,
    paths: Vec<String>,
    git: bool,
}

const NOISY: &[&str] = &["/node_modules/", "/target/", "/.git/objects/", "/.git/logs/", "/dist/", "/.next/", "/__pycache__/", "/.turbo/"];

/// (abaikan?, perubahan git?)
pub fn classify(p: &Path) -> (bool, bool) {
    let s = p.to_string_lossy();
    if s.contains(".nozel-tmp-") || s.ends_with(".DS_Store") {
        return (true, false);
    }
    if s.contains("/.git/") {
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let git = name == "HEAD" || name == "index" || s.contains("/.git/refs/") || name == "MERGE_HEAD";
        return (true, git);
    }
    (NOISY.iter().any(|n| s.contains(n)), false)
}

#[tauri::command]
pub async fn watch_project(app: AppHandle, state: State<'_, WatchState>, root: String, debounce_ms: u64) -> Result<(), String> {
    let mut slot = state.current.lock().map_err(|_| "State rusak")?;
    *slot = None; // hentikan watcher lama
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Ok(());
    }
    let (tx, rx) = channel::<Event>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(ev) = res {
            let _ = tx.send(ev);
        }
    })
    .map_err(|e| format!("Gagal memantau folder: {e}"))?;
    watcher
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Gagal memantau folder: {e}"))?;
    *slot = Some(watcher);

    let debounce = Duration::from_millis(debounce_ms.clamp(100, 5000));
    std::thread::spawn(move || {
        let mut paths: BTreeSet<String> = BTreeSet::new();
        let mut git = false;
        let mut first: Option<Instant> = None;
        loop {
            let wait = match first {
                Some(t) => debounce.saturating_sub(t.elapsed()),
                None => Duration::from_secs(3600),
            };
            match rx.recv_timeout(wait) {
                Ok(ev) => {
                    if matches!(ev.kind, EventKind::Access(_)) {
                        continue;
                    }
                    for p in ev.paths {
                        let (ignore, is_git) = classify(&p);
                        git |= is_git;
                        if !ignore {
                            paths.insert(p.to_string_lossy().to_string());
                        }
                    }
                    if (git || !paths.is_empty()) && first.is_none() {
                        first = Some(Instant::now());
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    if first.is_some() {
                        let _ = app.emit(
                            "fs-changed",
                            FsChanged { root: root.clone(), paths: std::mem::take(&mut paths).into_iter().take(500).collect(), git },
                        );
                        git = false;
                        first = None;
                    }
                }
                // Watcher diganti/dihapus → channel putus → thread selesai.
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn unwatch_project(state: State<'_, WatchState>) -> Result<(), String> {
    *state.current.lock().map_err(|_| "State rusak")? = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::classify;
    use std::path::Path;

    #[test]
    fn classifies_paths() {
        assert_eq!(classify(Path::new("/p/src/a.ts")), (false, false));
        assert_eq!(classify(Path::new("/p/node_modules/x/a.js")), (true, false));
        assert_eq!(classify(Path::new("/p/.git/index")), (true, true));
        assert_eq!(classify(Path::new("/p/.git/refs/heads/main")), (true, true));
        assert_eq!(classify(Path::new("/p/.git/objects/ab/cd")), (true, false));
        assert_eq!(classify(Path::new("/p/.a.ts.nozel-tmp-12")), (true, false));
    }
}
