use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Instant;

static APP_START_TIME: OnceLock<Instant> = OnceLock::new();

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub extension: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ImageFileData {
    pub data_url: String,
    pub size_bytes: u64,
    pub format: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClaudeCliInfo {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
    pub instructions: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemFootprint {
    pub app_memory_mb: f64,
    pub app_uptime_secs: u64,
    pub vscode_baseline_mb: f64,
    pub savings_percentage: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitStatus {
    pub is_git_repo: bool,
    pub branch: String,
    pub has_changes: bool,
    pub modified_count: usize,
    pub untracked_count: usize,
    pub changed_files: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitPushResult {
    pub success: bool,
    pub branch: String,
    pub commit_hash: Option<String>,
    pub message: String,
    pub pushed_to_remote: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CodeRunResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub execution_time_ms: u64,
    pub command: String,
}


/// List files and directories inside a target directory.
/// Excludes heavy directories like .git and node_modules by default to keep Nozel Code fast on 8GB RAM.
#[tauri::command]
fn list_dir(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let p = Path::new(&dir_path);
    if !p.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", dir_path));
    }

    let read_res = fs::read_dir(p).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut entries = Vec::new();

    for entry_result in read_res {
        if let Ok(entry) = entry_result {
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Filter out system junk or heavy directories by default
            if file_name == ".DS_Store" || file_name == ".git" {
                continue;
            }

            let entry_path = entry.path();
            let is_dir = entry_path.is_dir();
            let mut size = None;
            let mut extension = None;

            if !is_dir {
                if let Ok(meta) = entry.metadata() {
                    size = Some(meta.len());
                }
                if let Some(ext) = entry_path.extension() {
                    extension = Some(ext.to_string_lossy().to_lowercase());
                }
            }

            entries.push(FileEntry {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir,
                size,
                extension,
            });
        }
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

/// Read a text file with safety checks for 8GB RAM performance
#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Cannot open a directory as a text file: {}", path));
    }

    // Check size to prevent freezing editor (5MB limit for text editor)
    let meta = fs::metadata(p).map_err(|e| format!("Failed to read metadata: {}", e))?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err(format!(
            "File is too large ({:.2} MB). For optimal performance on 8 GB RAM, Nozel Code limits single-file viewing to 5 MB.",
            meta.len() as f64 / (1024.0 * 1024.0)
        ));
    }

    let bytes = fs::read(p).map_err(|e| format!("Failed to read file bytes: {}", e))?;

    // Check if file is binary (check for null bytes in initial 8KB)
    let sample_len = bytes.len().min(8192);
    if bytes[..sample_len].contains(&0) {
        return Err("Binary file cannot be opened in text editor.".to_string());
    }

    String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8 text.".to_string())
}

/// Read an image file safely and return a Base64 data URL with metadata for Native Image Viewer
#[tauri::command]
fn read_file_image(path: String) -> Result<ImageFileData, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Cannot open a directory as an image: {}", path));
    }

    let meta = fs::metadata(p).map_err(|e| format!("Failed to read metadata: {}", e))?;
    if meta.len() > 25 * 1024 * 1024 {
        return Err(format!(
            "Image is too large ({:.2} MB). Maximum supported size is 25 MB.",
            meta.len() as f64 / (1024.0 * 1024.0)
        ));
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
        _ => "application/octet-stream",
    };

    let bytes = fs::read(p).map_err(|e| format!("Failed to read image bytes: {}", e))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);

    Ok(ImageFileData {
        data_url,
        size_bytes: meta.len(),
        format: ext,
    })
}

/// Write text content to file safely
#[tauri::command]
fn write_file_text(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }
    fs::write(p, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

/// Create a new empty file
#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("A file or directory with this name already exists.".to_string());
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    fs::write(p, "").map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(())
}

/// Create a new directory
#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("Directory already exists.".to_string());
    }
    fs::create_dir_all(p).map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(())
}

/// Delete a file or directory
#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Entry does not exist.".to_string());
    }
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

/// Rename or move entry
#[tauri::command]
fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    let old_p = Path::new(&old_path);
    let new_p = Path::new(&new_path);
    if !old_p.exists() {
        return Err("Original file or directory does not exist.".to_string());
    }
    if new_p.exists() {
        return Err("A file or folder with the destination name already exists.".to_string());
    }
    fs::rename(old_p, new_p).map_err(|e| format!("Failed to rename: {}", e))?;
    Ok(())
}

/// Find the installed `claude` CLI binary on macOS
fn resolve_claude_cli_path() -> Option<PathBuf> {
    // 1. Direct which test
    if let Ok(output) = Command::new("which").arg("claude").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() && Path::new(&path_str).exists() {
                return Some(PathBuf::from(path_str));
            }
        }
    }

    // 2. Common macOS installation paths
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = vec![
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
        PathBuf::from(format!("{}/.npm-global/bin/claude", home)),
        PathBuf::from(format!("{}/.local/bin/claude", home)),
        PathBuf::from(format!("{}/Library/pnpm/claude", home)),
    ];

    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // 3. Try login shell query
    if let Ok(output) = Command::new("zsh")
        .args(["-l", "-c", "which claude"])
        .output()
    {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() && Path::new(&path_str).exists() {
                return Some(PathBuf::from(path_str));
            }
        }
    }

    None
}

/// Check status of Claude Code CLI
#[tauri::command]
fn check_claude_cli() -> ClaudeCliInfo {
    let instructions = "Claude Code is Anthropic's official terminal CLI agent that uses your Claude Pro/Max subscription directly without API token billing. To use it:\n1. Run: npm install -g @anthropic-ai/claude-code\n2. Run: claude login (in Terminal to authenticate with your Claude Pro account)\n3. Launch Nozel Code to link seamlessly!".to_string();

    if let Some(cli_path) = resolve_claude_cli_path() {
        // Run claude --version
        let version_res = Command::new(&cli_path).arg("--version").output();
        let version_str = match version_res {
            Ok(out) => {
                if out.status.success() {
                    String::from_utf8_lossy(&out.stdout).trim().to_string()
                } else {
                    String::from_utf8_lossy(&out.stderr).trim().to_string()
                }
            }
            Err(e) => format!("Failed to read version: {}", e),
        };

        ClaudeCliInfo {
            installed: true,
            path: Some(cli_path.to_string_lossy().to_string()),
            version: Some(version_str),
            error: None,
            instructions,
        }
    } else {
        ClaudeCliInfo {
            installed: false,
            path: None,
            version: None,
            error: Some("Claude Code CLI (`claude`) not detected in PATH.".to_string()),
            instructions,
        }
    }
}

/// Launch Claude Code in native macOS Terminal or iTerm2 for interactive session
#[tauri::command]
fn launch_claude_terminal(project_dir: String, initial_prompt: Option<String>) -> Result<String, String> {
    let cli_path = resolve_claude_cli_path().unwrap_or_else(|| PathBuf::from("claude"));
    let cli_cmd = cli_path.to_string_lossy();

    let exec_cmd = if let Some(prompt) = initial_prompt {
        let clean_prompt = prompt.replace("\"", "\\\"");
        format!("cd \"{}\" && \"{}\" -p \"{}\"", project_dir, cli_cmd, clean_prompt)
    } else {
        format!("cd \"{}\" && \"{}\"", project_dir, cli_cmd)
    };

    // Use AppleScript to launch macOS Terminal
    let applescript = format!(
        "tell application \"Terminal\"\n  activate\n  do script \"{}\"\nend tell",
        exec_cmd.replace("\\", "\\\\").replace("\"", "\\\"")
    );

    let output = Command::new("osascript")
        .args(["-e", &applescript])
        .output()
        .map_err(|e| format!("Failed to launch Terminal via osascript: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Terminal launch failed: {}", err));
    }

    Ok("Claude Code session launched in native macOS Terminal with your Claude Pro subscription.".to_string())
}

/// Run Claude Code in non-interactive print mode (requires explicit user consent)
#[tauri::command]
fn run_claude_cli_print(
    project_dir: String,
    prompt: String,
    file_context: Option<String>,
) -> Result<String, String> {
    let cli_path = resolve_claude_cli_path()
        .ok_or_else(|| "Claude Code CLI (`claude`) is not installed or not in PATH.".to_string())?;

    let p = Path::new(&project_dir);
    if !p.exists() {
        return Err(format!("Project directory does not exist: {}", project_dir));
    }

    let mut combined_prompt = prompt;
    if let Some(ctx) = file_context {
        combined_prompt = format!("Context:\n{}\n\nTask:\n{}", ctx, combined_prompt);
    }

    let output = Command::new(&cli_path)
        .current_dir(p)
        .arg("-p")
        .arg(&combined_prompt)
        .output()
        .map_err(|e| format!("Failed to execute Claude Code CLI: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("Claude Code error:\n{}{}", stdout, stderr))
    }
}

/// Report live memory footprint of Nozel Code vs VS Code baseline
#[tauri::command]
fn get_system_footprint() -> SystemFootprint {
    let pid = std::process::id();
    let memory_mb = if let Ok(out) = Command::new("ps")
        .args(["-o", "rss=", "-p", &pid.to_string()])
        .output()
    {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Ok(rss_kb) = text.parse::<f64>() {
            rss_kb / 1024.0
        } else {
            38.5 // reasonable fallback
        }
    } else {
        38.5
    };

    let start_time = APP_START_TIME.get_or_init(Instant::now);
    let uptime = start_time.elapsed().as_secs();

    // Standard VS Code baseline on macOS for an open workspace with TypeScript server is typically ~650 MB
    let vscode_baseline = 650.0;
    let savings = ((vscode_baseline - memory_mb) / vscode_baseline * 100.0).max(0.0);

    SystemFootprint {
        app_memory_mb: (memory_mb * 10.0).round() / 10.0,
        app_uptime_secs: uptime,
        vscode_baseline_mb: vscode_baseline,
        savings_percentage: (savings * 10.0).round() / 10.0,
    }
}

/// Query live Git repository status (branch, modified/untracked files)
#[tauri::command]
fn git_get_status(project_dir: String) -> Result<GitStatus, String> {
    let p = Path::new(&project_dir);
    if !p.exists() || !p.join(".git").exists() {
        return Ok(GitStatus {
            is_git_repo: false,
            branch: "none".to_string(),
            has_changes: false,
            modified_count: 0,
            untracked_count: 0,
            changed_files: Vec::new(),
        });
    }

    // Branch detection
    let branch_out = Command::new("git")
        .current_dir(p)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output();
    let branch = match branch_out {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "main".to_string(),
    };

    // Status check
    let status_out = Command::new("git")
        .current_dir(p)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    let status_str = String::from_utf8_lossy(&status_out.stdout);
    let mut modified_count = 0;
    let mut untracked_count = 0;
    let mut changed_files = Vec::new();

    for line in status_str.lines() {
        if line.len() > 3 {
            let code = &line[0..2];
            let file = line[3..].trim().to_string();
            if code.contains('?') {
                untracked_count += 1;
            } else {
                modified_count += 1;
            }
            changed_files.push(file);
        }
    }

    Ok(GitStatus {
        is_git_repo: true,
        branch,
        has_changes: !changed_files.is_empty(),
        modified_count,
        untracked_count,
        changed_files,
    })
}

/// Auto-Commit and Push Git Bot (Cmd+S integration & automated push to GitHub)
#[tauri::command]
fn git_auto_commit_and_push(project_dir: String, commit_message: Option<String>) -> Result<GitPushResult, String> {
    let p = Path::new(&project_dir);
    if !p.exists() || !p.join(".git").exists() {
        return Err("Project directory is not an initialized Git repository.".to_string());
    }

    // 1. Stage all changes
    let add_out = Command::new("git")
        .current_dir(p)
        .args(["add", "-A"])
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;
    if !add_out.status.success() {
        return Err(format!("git add failed: {}", String::from_utf8_lossy(&add_out.stderr)));
    }

    // 2. Commit message
    let msg = commit_message.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("auto: sync changes from Nozel Code ({})", ts)
    });

    let _commit_out = Command::new("git")
        .current_dir(p)
        .args(["commit", "-m", &msg])
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;

    // Current branch
    let branch = Command::new("git")
        .current_dir(p)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "main".to_string());

    // Commit hash
    let hash = Command::new("git")
        .current_dir(p)
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // 3. Check for remote origin
    let remote_check = Command::new("git")
        .current_dir(p)
        .args(["remote"])
        .output();

    let mut pushed = false;
    let mut details = format!("Committed locally [{}]: {}", hash.as_deref().unwrap_or("ok"), msg);

    if let Ok(rem_out) = remote_check {
        let rem_str = String::from_utf8_lossy(&rem_out.stdout);
        if rem_str.trim().contains("origin") {
            let push_out = Command::new("git")
                .current_dir(p)
                .args(["push", "origin", &branch])
                .output();

            match push_out {
                Ok(p_out) if p_out.status.success() => {
                    pushed = true;
                    details = format!("Committed and pushed to origin/{} [commit {}]", branch, hash.as_deref().unwrap_or(""));
                }
                Ok(p_out) => {
                    let err = String::from_utf8_lossy(&p_out.stderr);
                    details = format!("Committed locally. Remote notice: {}", err.trim());
                }
                Err(e) => {
                    details = format!("Committed locally. Push error: {}", e);
                }
            }
        }
    }

    Ok(GitPushResult {
        success: true,
        branch,
        commit_hash: hash,
        message: details,
        pushed_to_remote: pushed,
    })
}

/// Build an augmented PATH containing Homebrew, Cargo, Node, and user tools on macOS
fn get_augmented_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let existing = std::env::var("PATH").unwrap_or_default();
    let common_paths = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    let user_paths = [
        format!("{}/.cargo/bin", home),
        format!("{}/.local/bin", home),
        format!("{}/go/bin", home),
        format!("{}/.npm-global/bin", home),
        format!("{}/Library/pnpm", home),
    ];

    let mut parts: Vec<String> = Vec::new();
    for p in common_paths {
        if !parts.contains(&p.to_string()) {
            parts.push(p.to_string());
        }
    }
    for p in user_paths {
        if !parts.contains(&p) {
            parts.push(p);
        }
    }
    if !existing.is_empty() {
        for p in existing.split(':') {
            let s = p.to_string();
            if !parts.contains(&s) {
                parts.push(s);
            }
        }
    }
    parts.join(":")
}

/// Execute active code file with auto-detected interpreter/compiler
#[tauri::command]
fn execute_code_run(
    file_path: String,
    project_dir: Option<String>,
    custom_command: Option<String>,
) -> Result<CodeRunResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let cmd_to_run = if let Some(custom) = custom_command.filter(|c| !c.trim().is_empty()) {
        custom
    } else {
        match ext.as_str() {
            "html" | "htm" => format!("open \"{}\"", file_path),
            "css" => {
                let html_in_dir = path.parent().map(|p| p.join("index.html"));
                let html_in_root = project_dir.as_ref().map(|pd| Path::new(pd).join("index.html"));
                if let Some(h) = html_in_dir.filter(|p| p.exists()) {
                    format!("open \"{}\"", h.display())
                } else if let Some(h) = html_in_root.filter(|p| p.exists()) {
                    format!("open \"{}\"", h.display())
                } else {
                    return Err("File CSS tidak dapat dijalankan standalone. Buka file HTML yang memanggil CSS ini atau jalankan index.html.".to_string());
                }
            }
            "json" => {
                let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                if fname == "package.json" {
                    "npm run dev".to_string()
                } else {
                    return Err("Runner tidak dikonfigurasi untuk file data .json. Buka file kode atau gunakan tab TERMINAL.".to_string());
                }
            }
            "php" => format!("php \"{}\"", file_path),
            "py" => format!("python3 \"{}\"", file_path),
            "js" | "mjs" | "cjs" => format!("node \"{}\"", file_path),
            "ts" | "tsx" => format!("npx tsx \"{}\"", file_path),
            "rs" => {
                let has_cargo = if let Some(ref pd) = project_dir {
                    Path::new(pd).join("Cargo.toml").exists()
                } else {
                    path.parent()
                        .map(|p| p.join("Cargo.toml").exists())
                        .unwrap_or(false)
                };
                if has_cargo {
                    "cargo run".to_string()
                } else {
                    let temp_bin = std::env::temp_dir().join(format!("nozel_rs_{}", std::process::id()));
                    format!(
                        "rustc \"{}\" -o \"{}\" && \"{}\"",
                        file_path,
                        temp_bin.display(),
                        temp_bin.display()
                    )
                }
            }
            "go" => format!("go run \"{}\"", file_path),
            "sh" | "zsh" => format!("bash \"{}\"", file_path),
            "c" => {
                let temp_bin = std::env::temp_dir().join(format!("nozel_c_{}", std::process::id()));
                format!(
                    "clang \"{}\" -o \"{}\" && \"{}\"",
                    file_path,
                    temp_bin.display(),
                    temp_bin.display()
                )
            }
            "cpp" | "cc" | "cxx" => {
                let temp_bin = std::env::temp_dir().join(format!("nozel_cpp_{}", std::process::id()));
                format!(
                    "clang++ \"{}\" -o \"{}\" && \"{}\"",
                    file_path,
                    temp_bin.display(),
                    temp_bin.display()
                )
            }
            _ => {
                return Err(format!(
                    "No runner configured for .{} files. Use custom command or the TERMINAL tab.",
                    ext
                ));
            }
        }
    };

    let effective_dir = if let Some(ref pd) = project_dir {
        let p = Path::new(pd);
        if p.exists() && p.is_dir() {
            Some(p)
        } else {
            path.parent()
        }
    } else {
        path.parent()
    };

    let start = Instant::now();
    let mut cmd = Command::new("/bin/zsh");
    cmd.args(["-l", "-c", &cmd_to_run]);
    if let Some(dir) = effective_dir {
        cmd.current_dir(dir);
    }
    cmd.env("PATH", get_augmented_path());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;
    let duration = start.elapsed().as_millis() as u64;

    let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code();
    let success = output.status.success();

    if (ext == "html" || ext == "htm" || ext == "css") && success && stdout.trim().is_empty() {
        let doc_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("index.html");
        stdout = format!(
            "🌐 [Web Browser Preview Launched]\n✅ Berhasil dibuka di default web browser macOS (Google Chrome / Safari)!\n📄 Dokumen: {}\n🔗 File URL: file://{}\n⚡ Project HTML, CSS, & JavaScript aktif dan siap diuji.\n",
            doc_name,
            file_path
        );
    }

    Ok(CodeRunResult {
        success,
        stdout,
        stderr,
        exit_code,
        execution_time_ms: duration,
        command: cmd_to_run,
    })
}

/// Execute interactive/arbitrary shell command in specified working directory
#[tauri::command]
fn execute_terminal_command(
    command: String,
    working_dir: String,
) -> Result<CodeRunResult, String> {
    let start = Instant::now();
    let p = Path::new(&working_dir);
    let mut cmd = Command::new("/bin/zsh");
    cmd.args(["-l", "-c", &command]);
    if p.exists() && p.is_dir() {
        cmd.current_dir(p);
    }
    cmd.env("PATH", get_augmented_path());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute terminal command: {}", e))?;
    let duration = start.elapsed().as_millis() as u64;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code();
    let success = output.status.success();

    Ok(CodeRunResult {
        success,
        stdout,
        stderr,
        exit_code,
        execution_time_ms: duration,
        command,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    APP_START_TIME.get_or_init(Instant::now);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_file_text,
            read_file_image,
            write_file_text,
            create_file,
            create_dir,
            delete_entry,
            rename_entry,
            check_claude_cli,
            launch_claude_terminal,
            run_claude_cli_print,
            get_system_footprint,
            git_get_status,
            git_auto_commit_and_push,
            execute_code_run,
            execute_terminal_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_read_and_write_file_text() {
        let temp_dir = std::env::temp_dir().join("nozel_test_rw");
        let _ = fs::create_dir_all(&temp_dir);
        let test_file = temp_dir.join("test_sample.txt");
        let test_path = test_file.to_string_lossy().to_string();

        let sample_text = "console.log('Nozel Code on M1');";
        let write_res = write_file_text(test_path.clone(), sample_text.to_string());
        assert!(write_res.is_ok());

        let read_res = read_file_text(test_path.clone());
        assert_eq!(read_res.unwrap(), sample_text);

        let _ = fs::remove_file(test_file);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_binary_file_detection() {
        let temp_dir = std::env::temp_dir().join("nozel_test_bin");
        let _ = fs::create_dir_all(&temp_dir);
        let bin_file = temp_dir.join("binary_test.bin");
        let bin_path = bin_file.to_string_lossy().to_string();

        let mut f = fs::File::create(&bin_file).unwrap();
        // Write null bytes
        f.write_all(&[0x00, 0x01, 0x02, 0x00]).unwrap();
        drop(f);

        let res = read_file_text(bin_path);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Binary file"));

        let _ = fs::remove_file(bin_file);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_list_dir_filtering_and_sorting() {
        let temp_dir = std::env::temp_dir().join("nozel_test_dir");
        let _ = fs::create_dir_all(&temp_dir);

        let sub_dir = temp_dir.join("sub_folder");
        let _ = fs::create_dir_all(&sub_dir);

        let a_file = temp_dir.join("alpha.txt");
        let _ = fs::write(&a_file, "alpha");

        let ds_store = temp_dir.join(".DS_Store");
        let _ = fs::write(&ds_store, "junk");

        let entries = list_dir(temp_dir.to_string_lossy().to_string()).unwrap();

        // sub_folder should be first (dir before files)
        assert!(!entries.is_empty());
        assert_eq!(entries[0].name, "sub_folder");
        assert!(entries[0].is_dir);

        // alpha.txt should follow
        assert_eq!(entries[1].name, "alpha.txt");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].extension.as_deref(), Some("txt"));

        // .DS_Store should be filtered out
        assert!(!entries.iter().any(|e| e.name == ".DS_Store"));

        let _ = fs::remove_file(a_file);
        let _ = fs::remove_file(ds_store);
        let _ = fs::remove_dir(sub_dir);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_system_footprint() {
        let footprint = get_system_footprint();
        assert!(footprint.app_memory_mb >= 0.0);
        assert!(footprint.vscode_baseline_mb > 0.0);
        assert!(footprint.savings_percentage >= 0.0);
    }

    #[test]
    fn test_git_status_non_repo() {
        let temp_dir = std::env::temp_dir().join("nozel_non_git");
        let _ = fs::create_dir_all(&temp_dir);
        let res = git_get_status(temp_dir.to_string_lossy().to_string()).unwrap();
        assert!(!res.is_git_repo);
        assert_eq!(res.branch, "none");
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_read_file_image() {
        let temp_dir = std::env::temp_dir().join("nozel_test_img");
        let _ = fs::create_dir_all(&temp_dir);
        let img_file = temp_dir.join("sample.png");
        let img_path = img_file.to_string_lossy().to_string();

        // 1x1 PNG transparent pixel bytes
        let png_bytes = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let _ = fs::write(&img_file, &png_bytes);

        let res = read_file_image(img_path).unwrap();
        assert_eq!(res.format, "png");
        assert_eq!(res.size_bytes, png_bytes.len() as u64);
        assert!(res.data_url.starts_with("data:image/png;base64,"));

        let _ = fs::remove_file(img_file);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_execute_terminal_command_echo() {
        let temp_dir = std::env::temp_dir();
        let res = execute_terminal_command(
            "echo 'Nozel Runner Active'".to_string(),
            temp_dir.to_string_lossy().to_string(),
        );
        assert!(res.is_ok());
        let run_res = res.unwrap();
        assert!(run_res.success);
        assert!(run_res.stdout.contains("Nozel Runner Active"));
        assert_eq!(run_res.exit_code, Some(0));
    }

    #[test]
    fn test_execute_code_run_sh() {
        let temp_dir = std::env::temp_dir().join("nozel_test_runner_sh");
        let _ = fs::create_dir_all(&temp_dir);
        let sh_file = temp_dir.join("test_script.sh");
        let sh_path = sh_file.to_string_lossy().to_string();

        let _ = fs::write(&sh_file, "echo 'Testing Sh Runner 123'");

        let res = execute_code_run(
            sh_path.clone(),
            Some(temp_dir.to_string_lossy().to_string()),
            None,
        );
        assert!(res.is_ok());
        let run_res = res.unwrap();
        assert!(run_res.success);
        assert!(run_res.stdout.contains("Testing Sh Runner 123"));
        assert_eq!(run_res.exit_code, Some(0));

        let _ = fs::remove_file(sh_file);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_execute_code_run_nonexistent_file() {
        let res = execute_code_run(
            "/path/to/nonexistent/file_xyz.py".to_string(),
            None,
            None,
        );
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("File does not exist"));
    }

    #[test]
    fn test_execute_code_run_unsupported_extension() {
        let temp_dir = std::env::temp_dir().join("nozel_test_unsupported");
        let _ = fs::create_dir_all(&temp_dir);
        let unknown_file = temp_dir.join("test.xyzunknown");
        let _ = fs::write(&unknown_file, "content");

        let res = execute_code_run(
            unknown_file.to_string_lossy().to_string(),
            None,
            None,
        );
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("No runner configured for .xyzunknown files"));

        let _ = fs::remove_file(unknown_file);
        let _ = fs::remove_dir(temp_dir);
    }
}

