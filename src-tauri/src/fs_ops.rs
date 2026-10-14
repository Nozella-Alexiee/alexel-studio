//! Operasi berkas: baca, tulis atomik, buat, hapus ke Trash, rename, duplikat.

use crate::history;
use crate::util::{blocking, ensure_clean_path};
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Serialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: Option<u64>,
    pub extension: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct TextFile {
    pub content: String,
    pub mtime_ms: u64,
    pub eol: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ImageFileData {
    pub data_url: String,
    pub size_bytes: u64,
    pub format: String,
}

pub fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn list_dir_sync(dir: &Path) -> Result<Vec<FileEntry>, String> {
    if !dir.is_dir() {
        return Err(format!("Folder tidak ditemukan: {}", dir.display()));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("Gagal membaca folder: {e}"))?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".DS_Store" || name == ".git" {
            continue;
        }
        let path = entry.path();
        let ft = entry.file_type().ok();
        let is_symlink = ft.map(|t| t.is_symlink()).unwrap_or(false);
        // is_dir() mengikuti symlink; aman karena tree hanya dibuka satu level per klik.
        let is_dir = path.is_dir();
        let (size, extension) = if is_dir {
            (None, None)
        } else {
            (
                entry.metadata().ok().map(|m| m.len()),
                path.extension().map(|e| e.to_string_lossy().to_lowercase()),
            )
        };
        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            is_symlink,
            size,
            extension,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub async fn list_dir(dir_path: String) -> Result<Vec<FileEntry>, String> {
    blocking(move || list_dir_sync(Path::new(&dir_path))).await
}

pub fn read_text_sync(p: &Path) -> Result<TextFile, String> {
    let meta = fs::metadata(p).map_err(|_| format!("Berkas tidak ditemukan: {}", p.display()))?;
    if meta.is_dir() {
        return Err("Itu folder, bukan berkas.".into());
    }
    if !meta.is_file() {
        return Err("Ini bukan berkas biasa (pipe/device), tidak dibuka.".into());
    }
    if meta.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "Berkas terlalu besar ({:.1} MB). Batas editor 8 MB supaya tetap ringan.",
            meta.len() as f64 / 1_048_576.0
        ));
    }
    let bytes = fs::read(p).map_err(|e| format!("Gagal membaca berkas: {e}"))?;
    if bytes[..bytes.len().min(8192)].contains(&0) {
        return Err("BINARY: Berkas biner tidak bisa dibuka sebagai teks.".into());
    }
    let content = String::from_utf8(bytes).map_err(|_| {
        "ENCODING: Berkas bukan UTF-8. Nozel tidak membukanya supaya isinya tidak rusak saat disimpan."
            .to_string()
    })?;
    let eol = if content.contains("\r\n") { "crlf" } else { "lf" }.to_string();
    Ok(TextFile {
        content,
        mtime_ms: mtime_ms(p),
        eol,
    })
}

#[tauri::command]
pub async fn read_file_text(path: String) -> Result<TextFile, String> {
    blocking(move || read_text_sync(Path::new(&path))).await
}

#[tauri::command]
pub async fn read_file_image(path: String) -> Result<ImageFileData, String> {
    blocking(move || {
        let p = Path::new(&path);
        let meta = fs::metadata(p).map_err(|_| "Gambar tidak ditemukan.".to_string())?;
        if !meta.is_file() {
            return Err("Bukan berkas gambar.".into());
        }
        if meta.len() > MAX_IMAGE_BYTES {
            return Err("Gambar lebih dari 25 MB.".into());
        }
        let ext = p
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            "bmp" => "image/bmp",
            "avif" => "image/avif",
            _ => "application/octet-stream",
        };
        let bytes = fs::read(p).map_err(|e| format!("Gagal membaca gambar: {e}"))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(ImageFileData {
            data_url: format!("data:{mime};base64,{b64}"),
            size_bytes: meta.len(),
            format: ext,
        })
    })
    .await
}

/// Tulis atomik: isi ditulis ke berkas sementara di folder yang sama lalu di-rename,
/// jadi berkas tidak pernah setengah tertulis kalau aplikasi tertutup mendadak.
pub fn write_atomic(p: &Path, data: &[u8]) -> Result<(), String> {
    // Symlink: tulis ke target aslinya, bukan menimpa link-nya.
    let target = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    let parent = target.parent().ok_or("Path tidak valid.")?;
    fs::create_dir_all(parent).map_err(|e| format!("Gagal membuat folder: {e}"))?;
    let perms = fs::metadata(&target).ok().map(|m| m.permissions());
    let tmp = parent.join(format!(
        ".{}.nozel-tmp-{}",
        target.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
        std::process::id()
    ));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("Gagal menulis berkas: {e}"))?;
        f.write_all(data).map_err(|e| format!("Gagal menulis berkas: {e}"))?;
        f.sync_all().ok();
    }
    if let Some(perms) = perms {
        let _ = fs::set_permissions(&tmp, perms);
    }
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Gagal menyimpan berkas: {e}")
    })
}

#[tauri::command]
pub async fn write_file_text(app: AppHandle, path: String, content: String) -> Result<u64, String> {
    blocking(move || {
        let p = PathBuf::from(&path);
        write_atomic(&p, content.as_bytes())?;
        history::snapshot(&app, &p, &content);
        Ok(mtime_ms(&p))
    })
    .await
}

#[tauri::command]
pub async fn write_file_base64(path: String, data: String) -> Result<(), String> {
    blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data.as_bytes())
            .map_err(|e| format!("Data tidak valid: {e}"))?;
        write_atomic(Path::new(&path), &bytes)
    })
    .await
}

#[tauri::command]
pub async fn file_mtime(path: String) -> Result<u64, String> {
    Ok(mtime_ms(Path::new(&path)))
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    blocking(move || {
        let p = Path::new(&path);
        ensure_clean_path(p)?;
        if p.exists() {
            return Err("Sudah ada berkas atau folder dengan nama itu.".into());
        }
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Gagal membuat folder: {e}"))?;
        }
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(p)
            .map(|_| ())
            .map_err(|e| format!("Gagal membuat berkas: {e}"))
    })
    .await
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    blocking(move || {
        let p = Path::new(&path);
        ensure_clean_path(p)?;
        if p.exists() {
            return Err("Folder sudah ada.".into());
        }
        fs::create_dir_all(p).map_err(|e| format!("Gagal membuat folder: {e}"))
    })
    .await
}

/// Hapus = pindah ke Trash macOS, jadi selalu bisa dikembalikan.
#[tauri::command]
pub async fn delete_entry(path: String) -> Result<(), String> {
    blocking(move || {
        let p = Path::new(&path);
        if !p.exists() && fs::symlink_metadata(p).is_err() {
            return Err("Berkas sudah tidak ada.".into());
        }
        trash::delete(p).map_err(|e| format!("Gagal memindahkan ke Trash: {e}"))
    })
    .await
}

#[tauri::command]
pub async fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    blocking(move || {
        let (from, to) = (Path::new(&old_path), Path::new(&new_path));
        ensure_clean_path(to)?;
        if !from.exists() {
            return Err("Berkas asal tidak ada.".into());
        }
        // Rename yang cuma beda huruf besar/kecil di APFS dianggap "sudah ada"; izinkan.
        let same_ci = old_path.to_lowercase() == new_path.to_lowercase();
        if to.exists() && !same_ci {
            return Err("Sudah ada berkas dengan nama tujuan.".into());
        }
        fs::rename(from, to).map_err(|e| format!("Gagal rename: {e}"))
    })
    .await
}

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for e in fs::read_dir(from)?.flatten() {
            copy_recursive(&e.path(), &to.join(e.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

/// Duplikat "nama.ext" → "nama copy.ext", "nama copy 2.ext", ...
#[tauri::command]
pub async fn duplicate_entry(path: String) -> Result<String, String> {
    blocking(move || {
        let p = Path::new(&path);
        let parent = p.parent().ok_or("Path tidak valid.")?;
        let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let ext = p
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let ext = if p.is_dir() { String::new() } else { ext };
        let stem = if p.is_dir() {
            p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
        } else {
            stem
        };
        for i in 1..1000 {
            let suffix = if i == 1 { " copy".to_string() } else { format!(" copy {i}") };
            let cand = parent.join(format!("{stem}{suffix}{ext}"));
            if !cand.exists() {
                copy_recursive(p, &cand).map_err(|e| format!("Gagal duplikat: {e}"))?;
                return Ok(cand.to_string_lossy().to_string());
            }
        }
        Err("Terlalu banyak salinan.".into())
    })
    .await
}

#[tauri::command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    blocking(move || {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map_err(|e| format!("Gagal membuka Finder: {e}"))?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nozel_fs_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn atomic_write_and_read() {
        let d = tmp("rw");
        let f = d.join("a.txt");
        write_atomic(&f, b"halo\r\ndunia").unwrap();
        let t = read_text_sync(&f).unwrap();
        assert_eq!(t.content, "halo\r\ndunia");
        assert_eq!(t.eol, "crlf");
        assert!(t.mtime_ms > 0);
        // tidak ada sisa berkas sementara
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1);
    }

    #[test]
    fn rejects_binary_and_latin1() {
        let d = tmp("bin");
        let b = d.join("x.bin");
        fs::write(&b, [0u8, 1, 2, 3]).unwrap();
        assert!(read_text_sync(&b).unwrap_err().starts_with("BINARY"));
        let l = d.join("x.txt");
        fs::write(&l, [0x63u8, 0x61, 0x66, 0xe9]).unwrap();
        assert!(read_text_sync(&l).unwrap_err().starts_with("ENCODING"));
    }

    #[test]
    fn list_dir_sorts_dirs_first() {
        let d = tmp("ls");
        fs::write(d.join("b.rs"), "").unwrap();
        fs::write(d.join(".DS_Store"), "").unwrap();
        fs::create_dir(d.join("z_dir")).unwrap();
        let l = list_dir_sync(&d).unwrap();
        assert_eq!(l.len(), 2);
        assert!(l[0].is_dir);
        assert_eq!(l[1].extension.as_deref(), Some("rs"));
    }
}
