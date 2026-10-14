//! Nozel Code — backend Rust. Semua command berjalan async / di thread pool
//! blocking, jadi jendela tidak pernah macet saat git push, run, atau Claude bekerja.

mod claude;
mod fs_ops;
mod git;
mod history;
mod preview;
mod pty;
mod runner;
mod search;
mod settings;
mod system;
mod util;
mod watcher;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    system::mark_start();
    util::warm_path();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .manage(claude::ClaudeState::default())
        .manage(watcher::WatchState::default())
        .manage(preview::PreviewState::default())
        .register_uri_scheme_protocol("nozelpreview", preview::handle)
        .invoke_handler(tauri::generate_handler![
            fs_ops::list_dir,
            fs_ops::read_file_text,
            fs_ops::read_file_image,
            fs_ops::write_file_text,
            fs_ops::write_file_base64,
            fs_ops::file_mtime,
            fs_ops::create_file,
            fs_ops::create_dir,
            fs_ops::delete_entry,
            fs_ops::rename_entry,
            fs_ops::duplicate_entry,
            fs_ops::reveal_in_finder,
            history::history_list,
            history::history_read,
            search::list_project_files,
            search::search_project,
            search::replace_in_files,
            search::scan_todos,
            search::project_overview,
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_discard,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_log,
            git::git_branches,
            git::git_checkout,
            git::git_init,
            git::git_head_content,
            git::git_diff_file,
            git::git_auto_commit_file,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            runner::command_for_file,
            runner::detect_run_targets,
            claude::claude_detect,
            claude::claude_run,
            claude::claude_cancel,
            system::system_footprint,
            system::power_status,
            system::list_ports,
            system::kill_process,
            settings::store_load,
            settings::store_save,
            watcher::watch_project,
            watcher::unwatch_project,
            preview::preview_set_root,
            preview::preview_set_override,
        ])
        .build(tauri::generate_context!())
        .expect("gagal memulai Nozel Code");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Jangan tinggalkan shell, dev server, atau proses claude yatim.
            handle.state::<pty::PtyState>().kill_all();
            handle.state::<claude::ClaudeState>().kill_all();
        }
    });
}
