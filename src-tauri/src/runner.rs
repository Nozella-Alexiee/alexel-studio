//! Smart Run: menentukan perintah untuk menjalankan berkas aktif, dan mendeteksi
//! target run otomatis dari package.json, Cargo.toml, Makefile, composer.json, dll.
//! Perintahnya dijalankan di terminal PTY (frontend), jadi input interaktif tetap jalan.

use crate::util::{blocking, shell_quote};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct RunTarget {
    pub id: String,
    pub label: String,
    pub command: String,
    pub cwd: String,
    /// npm | cargo | make | composer | python | go | deno | docker | file
    pub kind: String,
    pub detail: String,
}

fn temp_bin(stem: &str) -> String {
    let safe: String = stem.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
    std::env::temp_dir()
        .join(format!("nozel-run-{}-{}", safe, std::process::id()))
        .to_string_lossy()
        .to_string()
}

fn find_up(start: &Path, name: &str, stop: &Path) -> Option<PathBuf> {
    let mut cur = Some(start);
    while let Some(d) = cur {
        if d.join(name).exists() {
            return Some(d.to_path_buf());
        }
        if d == stop {
            break;
        }
        cur = d.parent();
    }
    None
}

/// Perintah untuk menjalankan satu berkas. Semua path di-quote supaya nama berkas
/// berisi spasi, kutip, atau `$()` tidak bisa menyisipkan perintah lain.
pub fn command_for_file_sync(file: &Path, project: Option<&Path>) -> Result<RunTarget, String> {
    if !file.is_file() {
        return Err("Simpan berkas dulu sebelum dijalankan.".into());
    }
    let ext = file.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let stem = file.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let q = shell_quote(&file.to_string_lossy());
    let dir = file.parent().unwrap_or(Path::new("/"));
    let root = project.unwrap_or(dir);
    let mut cwd = dir.to_path_buf();

    let command = match ext.as_str() {
        "py" => format!("python3 {q}"),
        "js" | "mjs" | "cjs" => format!("node {q}"),
        "ts" | "mts" | "cts" | "tsx" => {
            if root.join("deno.json").exists() || root.join("deno.jsonc").exists() {
                format!("deno run -A {q}")
            } else {
                format!("npx --yes tsx {q}")
            }
        }
        "php" => format!("php {q}"),
        "rb" => format!("ruby {q}"),
        "go" => format!("go run {q}"),
        "lua" => format!("lua {q}"),
        "pl" => format!("perl {q}"),
        "swift" => format!("swift {q}"),
        "java" => format!("java {q}"),
        "kt" | "kts" => format!("kotlinc -script {q}"),
        "dart" => format!("dart run {q}"),
        "sh" | "bash" => format!("bash {q}"),
        "zsh" => format!("zsh {q}"),
        "rs" => match find_up(dir, "Cargo.toml", root) {
            Some(cargo_dir) => {
                cwd = cargo_dir;
                "cargo run".to_string()
            }
            None => {
                let b = shell_quote(&temp_bin(&stem));
                format!("rustc {q} -o {b} && {b}")
            }
        },
        "c" => {
            let b = shell_quote(&temp_bin(&stem));
            format!("clang -std=c17 -Wall {q} -o {b} && {b}")
        }
        "cpp" | "cc" | "cxx" => {
            let b = shell_quote(&temp_bin(&stem));
            format!("clang++ -std=c++20 -Wall {q} -o {b} && {b}")
        }
        "html" | "htm" | "svg" => format!("open {q}"),
        _ if name == "Makefile" => "make".to_string(),
        _ if name == "package.json" => {
            cwd = dir.to_path_buf();
            format!("{} run dev", package_manager(dir))
        }
        _ => {
            return Err(format!(
                "Belum ada runner untuk berkas .{ext}. Pakai Smart Run di toolbar atau jalankan lewat terminal."
            ))
        }
    };
    Ok(RunTarget {
        id: format!("file:{}", file.display()),
        label: format!("Jalankan {name}"),
        command,
        cwd: cwd.to_string_lossy().to_string(),
        kind: "file".into(),
        detail: name,
    })
}

#[tauri::command]
pub async fn command_for_file(file_path: String, project_dir: Option<String>) -> Result<RunTarget, String> {
    blocking(move || command_for_file_sync(Path::new(&file_path), project_dir.as_deref().map(Path::new))).await
}

fn package_manager(dir: &Path) -> &'static str {
    if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
        "bun"
    } else if dir.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if dir.join("yarn.lock").exists() {
        "yarn"
    } else {
        "npm"
    }
}

fn target(kind: &str, label: String, command: String, cwd: &Path, detail: String) -> RunTarget {
    RunTarget {
        id: format!("{kind}:{}:{label}", cwd.display()),
        label,
        command,
        cwd: cwd.to_string_lossy().to_string(),
        kind: kind.into(),
        detail,
    }
}

pub fn detect_targets_sync(root: &Path) -> Vec<RunTarget> {
    let mut out = Vec::new();

    // package.json scripts — "dev"/"start" diutamakan di atas.
    if let Ok(text) = fs::read_to_string(root.join("package.json")) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                let pm = package_manager(root);
                let mut names: Vec<&String> = scripts.keys().collect();
                let rank = |n: &str| match n {
                    "dev" => 0,
                    "start" => 1,
                    "build" => 2,
                    "test" => 3,
                    _ => 9,
                };
                names.sort_by_key(|n| (rank(n), n.to_string()));
                for n in names {
                    let detail = scripts[n].as_str().unwrap_or_default().to_string();
                    let cmd = if pm == "npm" && n != "start" && n != "test" {
                        format!("npm run {}", shell_quote(n))
                    } else {
                        format!("{pm} {}{}", if pm == "npm" { "" } else { "run " }, shell_quote(n))
                    };
                    out.push(target("npm", format!("{pm} {n}"), cmd, root, detail));
                }
            }
        }
    }

    if root.join("Cargo.toml").exists() {
        for (l, c) in [("cargo run", "cargo run"), ("cargo test", "cargo test"), ("cargo build --release", "cargo build --release"), ("cargo clippy", "cargo clippy")] {
            out.push(target("cargo", l.into(), c.into(), root, "Cargo.toml".into()));
        }
    }

    if let Ok(text) = fs::read_to_string(root.join("Makefile")) {
        let re = Regex::new(r"(?m)^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?:[^=]|$)").unwrap();
        let mut seen = std::collections::HashSet::new();
        for c in re.captures_iter(&text) {
            let t = c[1].to_string();
            if seen.insert(t.clone()) && seen.len() <= 20 {
                out.push(target("make", format!("make {t}"), format!("make {}", shell_quote(&t)), root, "Makefile".into()));
            }
        }
    }

    if let Ok(text) = fs::read_to_string(root.join("composer.json")) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                for n in scripts.keys() {
                    out.push(target("composer", format!("composer {n}"), format!("composer run-script {}", shell_quote(n)), root, "composer.json".into()));
                }
            }
        }
    }
    if root.join("artisan").exists() {
        out.push(target("php", "php artisan serve".into(), "php artisan serve".into(), root, "Laravel".into()));
    }

    if root.join("manage.py").exists() {
        out.push(target("python", "django runserver".into(), "python3 manage.py runserver".into(), root, "manage.py".into()));
    }
    for f in ["main.py", "app.py"] {
        if root.join(f).exists() {
            out.push(target("python", format!("python {f}"), format!("python3 {f}"), root, f.into()));
        }
    }
    if root.join("pyproject.toml").exists() && root.join("tests").is_dir() {
        out.push(target("python", "pytest".into(), "python3 -m pytest".into(), root, "pyproject.toml".into()));
    }

    if root.join("go.mod").exists() {
        out.push(target("go", "go run .".into(), "go run .".into(), root, "go.mod".into()));
        out.push(target("go", "go test ./...".into(), "go test ./...".into(), root, "go.mod".into()));
    }

    for f in ["deno.json", "deno.jsonc"] {
        if let Ok(text) = fs::read_to_string(root.join(f)) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(tasks) = json.get("tasks").and_then(|s| s.as_object()) {
                    for n in tasks.keys() {
                        out.push(target("deno", format!("deno task {n}"), format!("deno task {}", shell_quote(n)), root, f.into()));
                    }
                }
            }
        }
    }

    for f in ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"] {
        if root.join(f).exists() {
            out.push(target("docker", "docker compose up".into(), "docker compose up".into(), root, f.into()));
            break;
        }
    }

    if root.join("src-tauri/tauri.conf.json").exists() {
        let pm = package_manager(root);
        out.push(target("npm", format!("{pm} tauri dev"), format!("{pm} run tauri dev"), root, "Tauri".into()));
    }

    out
}

#[tauri::command]
pub async fn detect_run_targets(project_dir: String) -> Result<Vec<RunTarget>, String> {
    blocking(move || Ok(detect_targets_sync(Path::new(&project_dir)))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nozel_run_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn quotes_dangerous_file_names() {
        let d = dir("q");
        let f = d.join("a $(touch x) 'b'.py");
        fs::write(&f, "print(1)").unwrap();
        let t = command_for_file_sync(&f, None).unwrap();
        assert!(t.command.starts_with("python3 '"));
        assert!(t.command.contains("'\\''b'\\''"));
    }

    #[test]
    fn rust_uses_cargo_when_available() {
        let d = dir("rs");
        fs::create_dir_all(d.join("src")).unwrap();
        fs::write(d.join("Cargo.toml"), "[package]").unwrap();
        fs::write(d.join("src/main.rs"), "fn main(){}").unwrap();
        let t = command_for_file_sync(&d.join("src/main.rs"), Some(&d)).unwrap();
        assert_eq!(t.command, "cargo run");
        assert_eq!(PathBuf::from(&t.cwd), d);
    }

    #[test]
    fn unknown_extension_errors() {
        let d = dir("x");
        fs::write(d.join("a.xyz"), "").unwrap();
        assert!(command_for_file_sync(&d.join("a.xyz"), None).is_err());
    }

    #[test]
    fn detects_npm_make_and_cargo() {
        let d = dir("det");
        fs::write(d.join("package.json"), r#"{"scripts":{"test":"vitest","dev":"vite","lint":"eslint ."}}"#).unwrap();
        fs::write(d.join("pnpm-lock.yaml"), "").unwrap();
        fs::write(d.join("Makefile"), "build:\n\tcc x.c\nVAR := 1\nclean: build\n").unwrap();
        fs::write(d.join("Cargo.toml"), "").unwrap();
        let t = detect_targets_sync(&d);
        assert_eq!(t[0].label, "pnpm dev");
        assert_eq!(t[0].command, "pnpm run dev");
        assert!(t.iter().any(|x| x.command == "make build"));
        assert!(t.iter().any(|x| x.command == "make clean"));
        assert!(!t.iter().any(|x| x.command.contains("VAR")));
        assert!(t.iter().any(|x| x.command == "cargo test"));
    }
}
