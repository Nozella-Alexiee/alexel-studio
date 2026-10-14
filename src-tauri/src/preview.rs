//! Protokol `nozelpreview://` untuk pratinjau HTML langsung.
//! Halaman pratinjau tampil di iframe ber-sandbox dengan origin berbeda dari aplikasi,
//! jadi skrip di HTML milik project tidak bisa menyentuh API Tauri.
//! Hanya berkas di dalam folder project yang dilayani. Isi yang belum disimpan
//! bisa "ditimpa" lewat `preview_set_override` supaya pratinjau ikut ketikan.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, State, UriSchemeContext};

#[derive(Default)]
pub struct PreviewState {
    root: Mutex<Option<PathBuf>>,
    overrides: Mutex<HashMap<PathBuf, String>>,
}

#[tauri::command]
pub async fn preview_set_root(state: State<'_, PreviewState>, root: Option<String>) -> Result<(), String> {
    *state.root.lock().map_err(|_| "State rusak")? = root.map(|r| std::fs::canonicalize(&r).unwrap_or_else(|_| PathBuf::from(r)));
    state.overrides.lock().map_err(|_| "State rusak")?.clear();
    Ok(())
}

#[tauri::command]
pub async fn preview_set_override(state: State<'_, PreviewState>, path: String, content: Option<String>) -> Result<(), String> {
    let key = std::fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    let mut m = state.overrides.lock().map_err(|_| "State rusak")?;
    match content {
        Some(c) => {
            m.insert(key, c);
        }
        None => {
            m.remove(&key);
        }
    }
    Ok(())
}

pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn mime(p: &Path) -> &'static str {
    match p.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("mp4") => "video/mp4",
        Some("mp3") => "audio/mpeg",
        Some("wasm") => "application/wasm",
        Some("txt" | "md") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn respond(status: StatusCode, ctype: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", ctype)
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let app: &AppHandle<R> = ctx.app_handle();
    let state = app.state::<PreviewState>();
    let raw = percent_decode(req.uri().path());
    let mut path = PathBuf::from(&raw);
    if path.is_dir() {
        path = path.join("index.html");
    }
    let Some(root) = state.root.lock().ok().and_then(|r| r.clone()) else {
        return respond(StatusCode::FORBIDDEN, "text/plain", b"Belum ada project terbuka.".to_vec());
    };
    let canon = std::fs::canonicalize(&path).unwrap_or(path.clone());
    if !canon.starts_with(&root) {
        return respond(StatusCode::FORBIDDEN, "text/plain", b"Di luar folder project.".to_vec());
    }
    if let Some(c) = state.overrides.lock().ok().and_then(|m| m.get(&canon).cloned()) {
        return respond(StatusCode::OK, mime(&canon), c.into_bytes());
    }
    match std::fs::read(&canon) {
        Ok(b) => respond(StatusCode::OK, mime(&canon), b),
        Err(_) => respond(StatusCode::NOT_FOUND, "text/plain", b"Tidak ditemukan.".to_vec()),
    }
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_paths() {
        assert_eq!(percent_decode("/Users/a%20b/x.html"), "/Users/a b/x.html");
        assert_eq!(percent_decode("/caf%C3%A9.html"), "/café.html");
        assert_eq!(percent_decode("/50%"), "/50%");
        assert_eq!(percent_decode("/a%zz"), "/a%zz");
    }
}
