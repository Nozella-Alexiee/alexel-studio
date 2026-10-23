// Daftar command yang boleh dipanggil renderer. Nama & bentuk data sama dengan versi Tauri
// (lihat src/lib/ipc.ts), jadi frontend tidak perlu berubah.

import { managedInstall as installManaged, managedRemove } from "./managedServers";
import { app, BrowserWindow, clipboard, ClipboardItem, dialog, powerMonitor, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as agents from "./agents";
import * as CP from "./checkpoints";
import * as dap from "./dap";
import { checkUpdate, repoSlug } from "./update";
import { updateApply, updateCheck, updatePrepare } from "./updater";
import * as claude from "./claude";
import * as X from "./extensions";
import * as F from "./fsOps";
import * as G from "./git";
import * as H from "./history";
import * as lsp from "./lsp";
import * as preview from "./preview";
import * as pty from "./pty";
import * as runner from "./runner";
import * as S from "./search";
import * as store from "./store";
import { discoverProjects } from "./projects";
import * as sys from "./system";
import type { Ctx } from "./util";
import * as watcher from "./watcher";

type A = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Handler = (args: A, win: BrowserWindow | null) => unknown;

export function buildCommands(ctx: Ctx, hooks: { confirmClose: (win: BrowserWindow) => void; setMenu: (spec: unknown) => void }): Record<string, Handler> {
  return {
    // Berkas
    list_dir: (a) => F.listDir(a.dirPath),
    read_file_text: (a) => F.readText(a.path),
    read_file_image: (a) => F.readImage(a.path),
    write_file_text: (a) => F.writeText(ctx, a.path, a.content),
    write_file_base64: (a) => F.writeAtomic(a.path, Buffer.from(a.data, "base64")),
    file_mtime: (a) => F.mtimeMs(a.path),
    create_file: (a) => F.createFile(a.path),
    create_dir: (a) => F.createDir(a.path),
    delete_entry: (a) => F.deleteEntry(ctx, a.path),
    restore_deleted: (a) => F.restoreDeleted(ctx, String(a.token), String(a.path)),
    rename_entry: (a) => F.renameEntry(a.oldPath, a.newPath),
    duplicate_entry: (a) => F.duplicateEntry(a.path),
    reveal_in_finder: (a) => ctx.reveal(a.path),

    // Time-travel
    history_list: (a) => H.historyList(ctx, a.path),
    history_read: (a) => H.historyRead(ctx, a.path, a.id),

    // Pencarian
    list_project_files: (a) => S.listProjectFiles(a.root),
    search_project: (a) => S.searchProject(a.root, a.query, a as never),
    replace_in_files: (a) => S.replaceInFiles(ctx, a.paths, a.query, a.replacement, a as never),
    scan_todos: (a) => S.scanTodos(a.root),
    project_overview: (a) => S.projectOverview(a.root),

    // Git
    git_status: (a) => G.gitStatus(a.projectDir),
    git_clone: (a) => G.gitClone(String(a.url ?? ""), String(a.parent ?? "")),
    git_stage: (a) => G.gitStage(a.projectDir, a.paths),
    git_unstage: (a) => G.gitUnstage(a.projectDir, a.paths),
    git_discard: (a) => G.gitDiscard(ctx, a.projectDir, a.paths, a.untracked),
    git_commit: (a) => G.gitCommit(a.projectDir, a.message, !!a.amend),
    git_push: (a) => G.gitPush(a.projectDir),
    git_pull: (a) => G.gitPull(a.projectDir),
    git_log: (a) => G.gitLog(a.projectDir, a.limit ?? 50),
    git_branches: (a) => G.gitBranches(a.projectDir),
    git_checkout: (a) => G.gitCheckout(a.projectDir, a.branch, !!a.create),
    git_init: (a) => G.gitInit(a.projectDir),
    git_head_content: (a) => G.gitHeadContent(a.path),
    git_diff_file: (a) => G.gitDiffFile(a.projectDir, a.path, !!a.staged),
    git_auto_commit_file: (a) => G.gitAutoCommitFile(a.projectDir, a.path, !!a.push),

    // Terminal & run
    pty_spawn: (a) => pty.ptySpawn(ctx, a.cwd, a.cols, a.rows, a.command, a.env),
    pty_write: (a) => pty.ptyWrite(a.id, a.data),
    pty_resize: (a) => pty.ptyResize(a.id, a.cols, a.rows),
    pty_kill: (a) => pty.ptyKill(a.id),
    command_for_file: (a) => runner.commandForFile(a.filePath, a.projectDir),
    detect_run_targets: (a) => runner.detectTargets(a.projectDir),

    // Claude
    claude_detect: () => claude.claudeDetect(),
    claude_inline: (a) => claude.claudeOnce(String(a.runId), String(a.projectDir ?? ""), String(a.prompt ?? ""), a.model === "default" ? "default" : "fast"),
    agent_status: (a) => agents.agentStatus(ctx, a.agent, a.cfg ?? undefined),
    agent_login: (a) => agents.agentLogin(ctx, a.agent, a.cfg ?? undefined),
    agent_install: (a) => agents.agentInstall(ctx, a.agent),
    agent_uninstall: (a) => agents.agentUninstall(ctx, a.agent),
    agent_installed: (a) => agents.agentInstalled(ctx, a.agent),
    agent_send: (a) => agents.agentSend(ctx, a.agent, String(a.key ?? ""), a.cfg ?? {}, a.content),
    agent_control: (a) => agents.agentControl(ctx, a.agent, String(a.key ?? ""), a.msg),
    agent_close: (a) => agents.agentClose(a.agent, String(a.key ?? "")),
    agent_sessions: (a) => agents.agentSessions(ctx, a.agent, String(a.cwd ?? "")),
    agent_once: (a) => agents.agentOnce(ctx, a.agent, String(a.runId ?? ""), String(a.cwd ?? ""), String(a.prompt ?? "")),
    agent_once_cancel: (a) => agents.agentOnceCancel(String(a.runId ?? "")),
    git_commit_context: (a) => G.gitCommitContext(String(a.dir ?? "")),
    checkpoint_list: (a) => CP.checkpointList(ctx, String(a.root ?? ""), String(a.chatKey ?? "")),
    checkpoint_pre: (a) => CP.checkpointPre(ctx, String(a.root ?? ""), String(a.chatKey ?? ""), String(a.path ?? "")),
    checkpoint_restore: (a) => CP.checkpointRestore(ctx, String(a.root ?? ""), String(a.chatKey ?? ""), String(a.turnId ?? ""), Array.isArray(a.paths) ? a.paths.map(String) : null),
    agent_warm: (a) => agents.agentWarm(ctx, a.agent, String(a.key ?? ""), a.cfg ?? {}),
    agent_session_load: (a) => agents.agentSessionLoad(ctx, a.agent, String(a.cwd ?? ""), String(a.id ?? "")),
    claude_cancel: (a) => claude.claudeCancel(a.runId),

    // Debug (DAP)
    dap_status: (a) => dap.adapterStatus(ctx, a.kind),
    dap_install_jsdebug: () => dap.installJsDebug(ctx),
    dap_start: (a) => dap.dapStart(ctx, String(a.id ?? ""), a.kind, String(a.cwd ?? "")),
    dap_start_child: (a) => dap.dapStartChild(ctx, String(a.parent ?? ""), String(a.id ?? "")),
    dap_send: (a) => dap.dapSend(String(a.id ?? ""), a.message),
    dap_stop: (a) => dap.dapStop(String(a.id ?? "")),
    dap_build: (a) => dap.buildForDebug(String(a.file ?? "")),

    // Ekstensi (Open VSX, data saja)
    ext_search: (a) => X.extSearch({ query: String(a.query ?? ""), category: a.category ?? null, sortBy: a.sortBy, offset: Number(a.offset) || 0, size: Number(a.size) || undefined }),
    ext_inspect: (a) => X.extInspect(String(a.namespace), String(a.name), String(a.manifestUrl)),
    ext_details: (a) => X.extDetails(String(a.namespace), String(a.name)),
    ext_updates: () => X.extUpdates(ctx),
    ext_install: (a) => X.extInstall(ctx, a.namespace, a.name, a.version ?? null),
    ext_list: () => X.extList(ctx),
    ext_remove: (a) => X.extRemove(ctx, a.id),
    ext_read_file: (a) => X.extReadFile(ctx, a.id, a.path),

    // Language server
    lsp_status: () => lsp.serverStatus(ctx),
    lsp_install: (a) => installManaged(ctx, String(a.id)),
    lsp_remove: (a) => {
      lsp.killAllLsp();
      managedRemove(ctx, String(a.id));
      return null;
    },
    lsp_start: (a) => lsp.lspStart(ctx, a.serverId, a.root),
    lsp_send: (a) => lsp.lspSend(a.key, a.message),
    lsp_stop: (a) => lsp.lspStop(a.key),

    // Sistem
    discover_projects: (a) => discoverProjects(Array.isArray(a.parents) ? (a.parents as string[]) : []),
    system_footprint: () => {
      const m = app.getAppMetrics();
      const kb = m.reduce((s, p) => s + (p.memory?.workingSetSize ?? 0), 0);
      const cpu = m.reduce((s, p) => s + (p.cpu?.percentCPUUsage ?? 0), 0);
      return { core_mb: Math.round(kb / 102.4) / 10, cpu_percent: Math.round(cpu * 10) / 10, uptime_s: Math.round(process.uptime()), processes: m.length };
    },
    power_status: () => sys.powerStatus(powerMonitor.isOnBatteryPower()),
    list_ports: () => sys.listPorts(),
    kill_process: (a) => sys.killProcess(a.pid, !!a.force, app.getAppMetrics().map((m) => m.pid)),

    // Penyimpanan & watcher & pratinjau
    store_load: (a) => store.storeLoad(ctx, a.key),
    store_save: (a) => store.storeSave(ctx, a.key, a.json),
    settings_path: () => path.join(ctx.userData, "settings.json"),
    watch_project: (a) => watcher.watchProject(ctx, a.root, a.debounceMs ?? 300),
    unwatch_project: () => watcher.unwatch(),
    preview_set_root: (a) => preview.setRoot(a.root ?? null),
    preview_set_override: (a) => preview.setOverride(a.path, a.content ?? null),

    // Khusus Electron: dialog, browser, jendela, clipboard
    dialog_open_folder: async (_a, win) => {
      const r = win ? await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"], title: "Pilih folder project" }) : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return r.canceled ? null : r.filePaths[0] ?? null;
    },
    dialog_save: async (a, win) => {
      const opts = { defaultPath: a.defaultPath, filters: a.filters };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      return r.canceled ? null : r.filePath ?? null;
    },
    open_external: (a) => {
      if (typeof a.url === "string" && /^(https?:|mailto:)/i.test(a.url)) return shell.openExternal(a.url);
    },
    window_set_title: (a, win) => win?.setTitle(String(a.title ?? "Alexel Studio")),
    window_set_traffic_lights: (a, win) => {
      if (process.platform === "darwin" && win && typeof a.y === "number") win.setWindowButtonPosition({ x: 16, y: Math.max(6, Math.round(a.y)) });
    },
    /** Windows/Linux: warna & tinggi tombol jendela OS di title bar, mengikuti desain aktif. */
    window_set_titlebar_overlay: (a, win) => {
      if (process.platform === "darwin" || !win) return null;
      const ok = (c: unknown) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
      try {
        win.setTitleBarOverlay({ ...(ok(a.color) ? { color: a.color as string } : {}), ...(ok(a.symbolColor) ? { symbolColor: a.symbolColor as string } : {}), ...(typeof a.height === "number" ? { height: Math.round(a.height) } : {}) });
      } catch {
        /* overlay tidak didukung (mis. beberapa window manager Linux) */
      }
      return null;
    },
    /** Potong/salin/tempel/pilih semua pada elemen yang sedang fokus (dipakai menu klik kanan editor). */
    edit_action: (a, win) => {
      const wc = win?.webContents;
      const act = String(a.action);
      if (!wc || !["cut", "copy", "paste", "selectAll", "undo", "redo"].includes(act)) return null;
      (wc as unknown as Record<string, () => void>)[act]();
      return null;
    },
    menu_set: (a) => hooks.setMenu(a.spec),
    app_check_update: () => checkUpdate(),
    update_check: () => updateCheck(),
    update_prepare: () => updatePrepare(ctx),
    update_apply: () => updateApply(),
    app_repo: () => repoSlug(),
    app_info: () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform, arch: process.arch, osBuild: process.platform === "win32" ? os.release().split(".")[2] : undefined }),
    /** Aksi jendela untuk menu bar di dalam jendela (Windows/Linux). */
    window_action: (a, win) => {
      if (!win) return null;
      const act = String(a.action);
      if (act === "fullscreen") win.setFullScreen(!win.isFullScreen());
      else if (act === "minimize") win.minimize();
      else if (act === "maximize") (win.isMaximized() ? win.unmaximize() : win.maximize());
      else if (act === "close") win.close();
      else if (act === "devtools") win.webContents.toggleDevTools();
      else if (act === "zoomIn") win.webContents.setZoomLevel(Math.min(5, win.webContents.getZoomLevel() + 0.5));
      else if (act === "zoomOut") win.webContents.setZoomLevel(Math.max(-3, win.webContents.getZoomLevel() - 0.5));
      else if (act === "zoomReset") win.webContents.setZoomLevel(0);
      else if (act === "quit") app.quit();
      return null;
    },
    window_close_confirmed: (_a, win) => {
      if (win) hooks.confirmClose(win);
    },
    clipboard_write_image: async (a) => {
      const m = /^data:image\/png;base64,(.+)$/.exec(String(a.dataUrl));
      if (!m) throw new Error("Gambar tidak valid.");
      const png = new Blob([Buffer.from(m[1], "base64")], { type: "image/png" });
      await clipboard.write([new ClipboardItem({ "image/png": png })]);
    },
    path_is_dir: (a) => {
      try {
        return fs.statSync(a.path).isDirectory();
      } catch {
        return false;
      }
    },
  };
}
