//! Pencarian cepat seluruh project (menghormati .gitignore), Quick Open,
//! replace, papan TODO, dan ringkasan project untuk dashboard.

use crate::util::{blocking, HEAVY_DIRS};
use ignore::WalkBuilder;
use regex::{Regex, RegexBuilder};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_FILES: usize = 60_000;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_MATCHES: usize = 3_000;

fn walker(root: &Path) -> ignore::Walk {
    WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !(e.depth() > 0 && e.file_type().map(|t| t.is_dir()).unwrap_or(false) && HEAVY_DIRS.contains(&name.as_ref()))
                && name != ".DS_Store"
        })
        .build()
}

fn files_of(root: &Path) -> Vec<PathBuf> {
    walker(root)
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .take(MAX_FILES)
        .map(|e| e.into_path())
        .collect()
}

fn read_text_small(p: &Path) -> Option<String> {
    let meta = fs::metadata(p).ok()?;
    if meta.len() > MAX_SEARCH_FILE_BYTES {
        return None;
    }
    let bytes = fs::read(p).ok()?;
    if bytes[..bytes.len().min(4096)].contains(&0) {
        return None;
    }
    String::from_utf8(bytes).ok()
}

fn rel(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).to_string_lossy().to_string()
}

/// Daftar semua berkas (path relatif) untuk Quick Open ⌘P.
#[tauri::command]
pub async fn list_project_files(root: String) -> Result<Vec<String>, String> {
    blocking(move || {
        let r = PathBuf::from(&root);
        Ok(files_of(&r).iter().map(|p| rel(&r, p)).collect())
    })
    .await
}

#[derive(Serialize, Clone, Debug)]
pub struct SearchMatch {
    pub path: String,
    pub rel: String,
    pub line: usize,
    pub col: usize,
    pub len: usize,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub files_searched: usize,
    pub truncated: bool,
}

pub fn build_regex(query: &str, is_regex: bool, case_sensitive: bool, whole_word: bool) -> Result<Regex, String> {
    let mut pat = if is_regex { query.to_string() } else { regex::escape(query) };
    if whole_word {
        pat = format!(r"\b(?:{pat})\b");
    }
    RegexBuilder::new(&pat)
        .case_insensitive(!case_sensitive)
        .size_limit(1 << 22)
        .build()
        .map_err(|e| format!("Regex tidak valid: {e}"))
}

pub fn search_sync(root: &Path, re: &Regex, include: Option<&str>) -> SearchResult {
    let include = include.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());
    let mut matches = Vec::new();
    let mut files_searched = 0;
    let mut truncated = false;
    'outer: for p in files_of(root) {
        let r = rel(root, &p);
        if let Some(inc) = &include {
            if !inc.split(',').any(|i| r.to_lowercase().contains(i.trim().trim_start_matches('*'))) {
                continue;
            }
        }
        let Some(text) = read_text_small(&p) else { continue };
        files_searched += 1;
        for (i, line) in text.lines().enumerate() {
            for m in re.find_iter(line) {
                if m.start() == m.end() {
                    continue;
                }
                let preview: String = if line.len() > 240 {
                    let s = line.char_indices().map(|(i, _)| i).filter(|&i| i <= m.start().saturating_sub(60)).last().unwrap_or(0);
                    line[s..].chars().take(240).collect()
                } else {
                    line.to_string()
                };
                matches.push(SearchMatch {
                    path: p.to_string_lossy().to_string(),
                    rel: r.clone(),
                    line: i + 1,
                    col: line[..m.start()].chars().count() + 1,
                    len: m.as_str().chars().count(),
                    text: preview,
                });
                if matches.len() >= MAX_MATCHES {
                    truncated = true;
                    break 'outer;
                }
            }
        }
    }
    SearchResult { matches, files_searched, truncated }
}

#[tauri::command]
pub async fn search_project(
    root: String,
    query: String,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
    include: Option<String>,
) -> Result<SearchResult, String> {
    blocking(move || {
        if query.is_empty() {
            return Ok(SearchResult { matches: vec![], files_searched: 0, truncated: false });
        }
        let re = build_regex(&query, is_regex, case_sensitive, whole_word)?;
        Ok(search_sync(Path::new(&root), &re, include.as_deref()))
    })
    .await
}

/// Ganti semua kecocokan di berkas-berkas yang dipilih. Mengembalikan jumlah penggantian.
#[tauri::command]
pub async fn replace_in_files(
    app: tauri::AppHandle,
    paths: Vec<String>,
    query: String,
    replacement: String,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<usize, String> {
    blocking(move || {
        let re = build_regex(&query, is_regex, case_sensitive, whole_word)?;
        let mut total = 0;
        for p in paths {
            let path = PathBuf::from(&p);
            let Some(text) = read_text_small(&path) else { continue };
            let n = re.find_iter(&text).count();
            if n == 0 {
                continue;
            }
            let out = if is_regex {
                re.replace_all(&text, replacement.as_str()).to_string()
            } else {
                re.replace_all(&text, regex::NoExpand(&replacement)).to_string()
            };
            crate::fs_ops::write_atomic(&path, out.as_bytes())?;
            crate::history::snapshot(&app, &path, &out);
            total += n;
        }
        Ok(total)
    })
    .await
}

#[derive(Serialize, Clone, Debug)]
pub struct TodoItem {
    pub path: String,
    pub rel: String,
    pub line: usize,
    pub tag: String,
    pub text: String,
}

pub fn todo_regex() -> Regex {
    Regex::new(r"(?:^|[^A-Za-z0-9_])(TODO|FIXME|HACK|BUG|XXX|NOTE)\b[:\s(]*(.*)").unwrap()
}

pub fn scan_todos_sync(root: &Path) -> Vec<TodoItem> {
    let re = todo_regex();
    let mut out = Vec::new();
    for p in files_of(root) {
        let Some(text) = read_text_small(&p) else { continue };
        let r = rel(root, &p);
        for (i, line) in text.lines().enumerate() {
            if let Some(c) = re.captures(line) {
                let body = c.get(2).map(|m| m.as_str()).unwrap_or("");
                let body = body
                    .trim()
                    .trim_end_matches("*/")
                    .trim_end_matches("-->")
                    .trim()
                    .trim_start_matches(')')
                    .trim_start_matches(':')
                    .trim();
                out.push(TodoItem {
                    path: p.to_string_lossy().to_string(),
                    rel: r.clone(),
                    line: i + 1,
                    tag: c[1].to_string(),
                    text: body.chars().take(200).collect(),
                });
                if out.len() >= 5_000 {
                    return out;
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn scan_todos(root: String) -> Result<Vec<TodoItem>, String> {
    blocking(move || Ok(scan_todos_sync(Path::new(&root)))).await
}

#[derive(Serialize, Clone, Debug)]
pub struct LangStat {
    pub ext: String,
    pub files: usize,
    pub bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct ProjectOverview {
    pub name: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub languages: Vec<LangStat>,
    pub last_modified_ms: u64,
    pub last_modified_file: Option<String>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn project_overview(root: String) -> Result<ProjectOverview, String> {
    blocking(move || {
        let r = PathBuf::from(&root);
        if !r.is_dir() {
            return Err("Folder project tidak ditemukan.".into());
        }
        let files = files_of(&r);
        let mut by_ext: HashMap<String, (usize, u64)> = HashMap::new();
        let mut total = 0;
        let mut newest = (0u64, None::<String>);
        for p in &files {
            let meta = match fs::metadata(p) {
                Ok(m) => m,
                Err(_) => continue,
            };
            total += meta.len();
            let ext = p
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_else(|| "lainnya".into());
            let e = by_ext.entry(ext).or_insert((0, 0));
            e.0 += 1;
            e.1 += meta.len();
            let m = crate::fs_ops::mtime_ms(p);
            if m > newest.0 {
                newest = (m, Some(rel(&r, p)));
            }
        }
        let mut languages: Vec<LangStat> = by_ext
            .into_iter()
            .map(|(ext, (files, bytes))| LangStat { ext, files, bytes })
            .collect();
        languages.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        languages.truncate(8);
        Ok(ProjectOverview {
            name: r.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            file_count: files.len(),
            total_bytes: total,
            languages,
            last_modified_ms: newest.0,
            last_modified_file: newest.1,
            truncated: files.len() >= MAX_FILES,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nozel_search_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("src")).unwrap();
        fs::create_dir_all(d.join("node_modules/x")).unwrap();
        fs::write(d.join("src/a.ts"), "const a = 1; // TODO: rapikan\nfoo(a)\n").unwrap();
        fs::write(d.join("src/b.rs"), "fn foo() {}\n/* FIXME pindah ke modul */\n").unwrap();
        fs::write(d.join("node_modules/x/i.js"), "foo TODO jangan muncul").unwrap();
        d
    }

    #[test]
    fn search_skips_heavy_dirs_and_finds_matches() {
        let d = fixture("a");
        let re = build_regex("foo", false, true, true).unwrap();
        let r = search_sync(&d, &re, None);
        assert_eq!(r.matches.len(), 2);
        assert!(r.matches.iter().all(|m| !m.rel.contains("node_modules")));
        let a = r.matches.iter().find(|m| m.rel.ends_with("a.ts")).unwrap();
        assert_eq!((a.line, a.col, a.len), (2, 1, 3));
    }

    #[test]
    fn include_filter_and_regex() {
        let d = fixture("b");
        let re = build_regex(r"fn\s+\w+", true, true, false).unwrap();
        assert_eq!(search_sync(&d, &re, Some("*.rs")).matches.len(), 1);
        assert_eq!(search_sync(&d, &re, Some(".ts")).matches.len(), 0);
        assert!(build_regex("(", true, true, false).is_err());
    }

    #[test]
    fn todos_are_parsed() {
        let d = fixture("c");
        let t = scan_todos_sync(&d);
        assert_eq!(t.len(), 2);
        let fix = t.iter().find(|x| x.tag == "FIXME").unwrap();
        assert_eq!(fix.text, "pindah ke modul");
        let todo = t.iter().find(|x| x.tag == "TODO").unwrap();
        assert_eq!(todo.text, "rapikan");
    }
}
