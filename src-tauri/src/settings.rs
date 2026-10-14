//! Penyimpanan kecil berbentuk JSON di ~/Library/Application Support/com.nozel.code/
//! untuk pengaturan, sesi (tab terbuka, layout), dan daftar project terakhir.

use crate::fs_ops::write_atomic;
use crate::util::blocking;
use std::fs;
use tauri::{AppHandle, Manager};

fn valid_key(k: &str) -> bool {
    !k.is_empty() && k.len() <= 64 && k.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

#[tauri::command]
pub async fn store_load(app: AppHandle, key: String) -> Result<Option<String>, String> {
    blocking(move || {
        if !valid_key(&key) {
            return Err("Kunci tidak valid.".into());
        }
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        match fs::read_to_string(dir.join(format!("{key}.json"))) {
            Ok(s) => Ok(Some(s)),
            Err(_) => Ok(None),
        }
    })
    .await
}

#[tauri::command]
pub async fn store_save(app: AppHandle, key: String, json: String) -> Result<(), String> {
    blocking(move || {
        if !valid_key(&key) {
            return Err("Kunci tidak valid.".into());
        }
        serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("JSON tidak valid: {e}"))?;
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        write_atomic(&dir.join(format!("{key}.json")), json.as_bytes())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::valid_key;

    #[test]
    fn keys_are_restricted() {
        assert!(valid_key("settings"));
        assert!(valid_key("session_v2"));
        assert!(!valid_key("../x"));
        assert!(!valid_key("A"));
        assert!(!valid_key(""));
    }
}
