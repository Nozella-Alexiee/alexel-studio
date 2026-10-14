//! Time-travel per berkas: setiap simpan menyimpan salinan ke
//! ~/Library/Application Support/com.nozel.code/history/<hash>/<waktu>.snap
//! tanpa butuh git. Dibatasi jumlah & ukurannya supaya disk tidak bengkak.

use crate::util::{blocking, now_ms};
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_SNAPSHOTS_PER_FILE: usize = 80;
const MAX_BYTES_PER_FILE: u64 = 24 * 1024 * 1024;
const MAX_SNAPSHOT_SIZE: usize = 2 * 1024 * 1024;

#[derive(Serialize, Clone, Debug)]
pub struct Snapshot {
    pub id: String,
    pub time_ms: u64,
    pub size: u64,
    pub lines: usize,
}

fn hash_str(s: &str) -> String {
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn root(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("history"))
}

fn dir_for(app: &AppHandle, file: &Path) -> Option<PathBuf> {
    root(app).map(|r| r.join(hash_str(&file.to_string_lossy())))
}

fn list_sorted(dir: &Path) -> Vec<(u64, PathBuf, u64)> {
    let mut v: Vec<(u64, PathBuf, u64)> = fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.extension()?.to_str()? != "snap" {
                        return None;
                    }
                    let t: u64 = p.file_stem()?.to_str()?.parse().ok()?;
                    let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                    Some((t, p, size))
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by_key(|x| x.0);
    v
}

/// Dipanggil setiap kali berkas disimpan. Gagal di sini tidak boleh menggagalkan simpan.
pub fn snapshot(app: &AppHandle, file: &Path, content: &str) {
    if content.len() > MAX_SNAPSHOT_SIZE {
        return;
    }
    let Some(dir) = dir_for(app, file) else { return };
    snapshot_in(&dir, file, content);
}

pub fn snapshot_in(dir: &Path, file: &Path, content: &str) {
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    let _ = fs::write(dir.join("path.txt"), file.to_string_lossy().as_bytes());
    let existing = list_sorted(dir);
    if let Some((_, last, _)) = existing.last() {
        if fs::read_to_string(last).map(|s| s == content).unwrap_or(false) {
            return;
        }
    }
    let mut t = now_ms();
    if existing.last().map(|x| x.0 >= t).unwrap_or(false) {
        t = existing.last().unwrap().0 + 1;
    }
    if fs::write(dir.join(format!("{t}.snap")), content).is_err() {
        return;
    }
    let mut all = list_sorted(dir);
    let mut total: u64 = all.iter().map(|x| x.2).sum();
    while all.len() > MAX_SNAPSHOTS_PER_FILE || (total > MAX_BYTES_PER_FILE && all.len() > 1) {
        let (_, p, s) = all.remove(0);
        let _ = fs::remove_file(p);
        total = total.saturating_sub(s);
    }
}

#[tauri::command]
pub async fn history_list(app: AppHandle, path: String) -> Result<Vec<Snapshot>, String> {
    blocking(move || {
        let Some(dir) = dir_for(&app, Path::new(&path)) else { return Ok(vec![]) };
        let mut out: Vec<Snapshot> = list_sorted(&dir)
            .into_iter()
            .map(|(t, p, size)| Snapshot {
                id: t.to_string(),
                time_ms: t,
                size,
                lines: fs::read_to_string(&p).map(|s| s.lines().count()).unwrap_or(0),
            })
            .collect();
        out.reverse();
        Ok(out)
    })
    .await
}

#[tauri::command]
pub async fn history_read(app: AppHandle, path: String, id: String) -> Result<String, String> {
    blocking(move || {
        if !id.chars().all(|c| c.is_ascii_digit()) {
            return Err("ID snapshot tidak valid.".into());
        }
        let dir = dir_for(&app, Path::new(&path)).ok_or("Folder riwayat tidak tersedia.")?;
        fs::read_to_string(dir.join(format!("{id}.snap"))).map_err(|_| "Snapshot tidak ditemukan.".into())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupes_and_caps() {
        let dir = std::env::temp_dir().join(format!("nozel_hist_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let f = Path::new("/tmp/x.ts");
        snapshot_in(&dir, f, "a");
        snapshot_in(&dir, f, "a");
        assert_eq!(list_sorted(&dir).len(), 1, "isi sama tidak disimpan dua kali");
        for i in 0..(MAX_SNAPSHOTS_PER_FILE + 5) {
            snapshot_in(&dir, f, &format!("v{i}"));
        }
        let all = list_sorted(&dir);
        assert_eq!(all.len(), MAX_SNAPSHOTS_PER_FILE);
        let newest = fs::read_to_string(&all.last().unwrap().1).unwrap();
        assert_eq!(newest, format!("v{}", MAX_SNAPSHOTS_PER_FILE + 4));
    }
}
