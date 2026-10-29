// Daftar command yang boleh dipanggil renderer. Nama & bentuk data sama dengan versi Tauri
// (lihat src/lib/ipc.ts), jadi frontend tidak perlu berubah.

import { ideServer, stopIde } from "./ide";
import { hostManager } from "./exthost/manager";
import { managedInstall as installManaged, managedRemove } from "./managedServers";
import { app, BrowserWindow, clipboard, ClipboardItem, dialog, powerMonitor, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as agents from "./agents";
import * as CP from "./checkpoints";
import * as DB from "./db";
import * as HTTP from "./http";
import * as DK from "./docker";
import * as BR from "./browser";
import * as JP from "./jupyter";
import * as RM from "./remote";
import { detect as dbDetect, detectFull as dbDetectFull } from "./db/detect";
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
import { gitEnv, runCapture, type Ctx } from "./util";
import * as watcher from "./watcher";

type A = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Handler = (args: A, win: BrowserWindow | null) => unknown;

export function buildCommands(ctx: Ctx, hooks: { confirmClose: (win: BrowserWindow) => void; setMenu: (spec: unknown) => void }): Record<string, Handler> {
  return {
    // Berkas
    list_dir: (a) => F.listDir(a.dirPath),
    read_file_text: (a) => F.readText(a.path),
    read_file_image: (a) => F.readImage(a.path),
    read_file_head: (a) => F.readHead(String(a.path ?? ""), Number(a.max) || undefined),
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
    git_log: (a) => G.gitLog(a.projectDir, a.limit ?? 50, !!a.all),
    git_stash_list: (a) => G.gitStashList(a.projectDir),
    git_stash_push: (a) => G.gitStashPush(a.projectDir, String(a.message ?? ""), !!a.untracked),
    git_stash_apply: (a) => G.gitStashApply(a.projectDir, String(a.ref ?? ""), !!a.pop),
    git_stash_drop: (a) => G.gitStashDrop(a.projectDir, String(a.ref ?? "")),
    git_fetch: (a) => G.gitFetch(a.projectDir),
    git_branch_delete: (a) => G.gitBranchDelete(a.projectDir, String(a.name ?? ""), !!a.force),
    git_branch_rename: (a) => G.gitBranchRename(a.projectDir, String(a.from ?? ""), String(a.to ?? "")),
    git_remote_branches: (a) => G.gitRemoteBranches(a.projectDir),
    git_tags: (a) => G.gitTags(a.projectDir),
    git_tag_create: (a) => G.gitTagCreate(a.projectDir, String(a.name ?? ""), a.target ? String(a.target) : null, String(a.message ?? "")),
    git_tag_delete: (a) => G.gitTagDelete(a.projectDir, String(a.name ?? "")),
    git_op_state: (a) => G.gitOpState(a.projectDir),
    git_merge: (a) => G.gitMerge(a.projectDir, String(a.branch ?? "")),
    git_rebase: (a) => G.gitRebase(a.projectDir, String(a.onto ?? "")),
    git_cherry_pick: (a) => G.gitCherryPick(a.projectDir, String(a.sha ?? "")),
    git_revert_commit: (a) => G.gitRevertCommit(a.projectDir, String(a.sha ?? "")),
    git_op_continue: (a) => G.gitOpContinue(a.projectDir),
    git_op_abort: (a) => G.gitOpAbort(a.projectDir),
    git_apply_patch: (a) => G.gitApplyPatch(a.projectDir, String(a.patch ?? ""), !!a.cached, !!a.reverse),
    git_blame: (a) => G.gitBlame(String(a.path ?? "")),
    git_show_commit: (a) => G.gitShowCommit(a.projectDir, String(a.sha ?? "")),
    git_branches: (a) => G.gitBranches(a.projectDir),
    git_checkout: (a) => G.gitCheckout(a.projectDir, a.branch, !!a.create, a.start ? String(a.start) : null),
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
    ext_lookup: (a) => X.extLookup(Array.isArray(a.ids) ? a.ids.map(String) : []),
    ext_inspect: (a) => X.extInspect(String(a.namespace), String(a.name), String(a.manifestUrl)),
    ext_details: (a) => X.extDetails(String(a.namespace), String(a.name)),
    ext_updates: () => X.extUpdates(ctx),
    ext_install: (a) => X.extInstall(ctx, a.namespace, a.name, a.version ?? null),
    ext_list: (a) => X.extList(ctx, typeof a.lang === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(a.lang) ? a.lang : "en"),
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
    watch_project: (a) => watcher.watchProject(ctx, a.root, a.debounceMs ?? 300, Array.isArray(a.extra) ? a.extra.filter((x: unknown): x is string => typeof x === "string") : []),
    unwatch_project: () => watcher.unwatch(),
    preview_set_root: (a) => preview.setRoot(a.root ?? null),
    preview_set_override: (a) => preview.setOverride(a.path, a.content ?? null),

    // Database
    db_list: () => DB.listConnections(ctx).map((c) => ({ ...c, connected: DB.isConnected(c.id) })),
    db_save: (a) => DB.saveConnection(ctx, a.conn ?? {}),
    db_remove: (a) => DB.removeConnection(ctx, String(a.id)),
    db_test: (a) => DB.testConnection(ctx, a.conn ?? {}),
    db_disconnect: (a) => DB.disconnect(String(a.id)),
    db_schema: (a) => DB.schema(ctx, String(a.id)),
    db_schema_text: async (a) => {
      const c = DB.listConnections(ctx).find((x) => x.id === a.id);
      if (!c) throw new Error("Koneksi tidak ditemukan.");
      return DB.schemaText(c.kind, await DB.schema(ctx, c.id), Number(a.max) || undefined);
    },
    db_query: (a) => DB.query(ctx, String(a.id), String(a.text ?? ""), { limit: a.limit, timeoutMs: a.timeoutMs, confirmed: !!a.confirmed }),
    db_cancel: (a) => DB.cancel(String(a.id)),
    db_browse: (a) => DB.browse(ctx, String(a.id), a.o),
    db_edit: (a) => DB.editRow(ctx, String(a.id), a.edit),
    db_export: (a) => DB.exportQuery(ctx, String(a.id), String(a.text ?? ""), a.format === "json" ? "json" : "csv", String(a.target)),
    db_history: (a) => DB.history(ctx, String(a.id)),
    db_detect: (a) => dbDetect(String(a.root ?? "")),
    db_add_detected: (a) => {
      const d = dbDetectFull(String(a.root ?? "")).find((x) => x.key === a.key);
      if (!d) throw new Error("Saran koneksi tidak ditemukan lagi.");
      const existing = DB.listConnections(ctx).find((c) => c.kind === d.kind && (c.url ?? c.file) === (d.url ?? d.file));
      if (existing) return existing;
      return DB.saveConnection(ctx, { kind: d.kind, name: d.name, url: d.url, file: d.file, password: d.password, env: "dev" });
    },

    // Remote SSH (OpenSSH sistem)
    remote_hosts: () => RM.listHosts(ctx),
    remote_save_host: (a) => RM.saveHost(ctx, String(a.target ?? ""), !!a.remove),
    remote_connect: (a) => RM.connect(String(a.target)),
    remote_list: (a) => RM.listDir(String(a.target), String(a.dir)),
    remote_open: (a) => RM.openRemote(ctx, String(a.target), String(a.path)),
    remote_push: (a) => RM.pushMirror(ctx, String(a.local)),
    remote_from_mirror: (a) => RM.fromMirror(ctx, String(a.local)),
    remote_op: (a) => RM.remoteOp(String(a.target), a.op, String(a.a), a.b === undefined ? undefined : String(a.b)),
    remote_terminal_cmd: (a) => RM.terminalCommand(String(a.target), a.dir ? String(a.dir) : undefined),
    remote_disconnect: (a) => RM.closeMaster(String(a.target)),

    // Notebook (Jupyter Server lokal)
    jupyter_specs: (a) => JP.kernelSpecs(String(a.root), a.jupyter ?? null),
    jupyter_start: (a) => JP.startKernel(ctx, String(a.root), a.name ?? null, a.jupyter ?? null),
    jupyter_execute: (a) => JP.execute(String(a.id), String(a.cell), String(a.code ?? "")),
    jupyter_interrupt: (a) => JP.interrupt(String(a.id)),
    jupyter_restart: (a) => JP.restart(String(a.id)),
    jupyter_shutdown: (a) => JP.shutdownKernel(String(a.id)),

    // Tab browser (WebContentsView)
    browser_create: (a, win) => {
      if (!win) throw new Error("Jendela tidak ditemukan.");
      return BR.createBrowser(ctx, win, String(a.url ?? ""), String(a.tag ?? ""));
    },
    browser_bounds: (a) => BR.setBounds(Number(a.id), { x: Number(a.x) || 0, y: Number(a.y) || 0, width: Number(a.width) || 0, height: Number(a.height) || 0, visible: !!a.visible }),
    browser_navigate: (a) => BR.navigate(Number(a.id), String(a.url ?? "")),
    browser_control: (a) => BR.control(Number(a.id), a.action),
    browser_emulate: (a) => BR.emulate(Number(a.id), a.device ?? null),
    browser_screenshot: (a) => BR.screenshot(Number(a.id)),
    browser_destroy: (a) => BR.destroyBrowser(Number(a.id)),
    browser_clear_data: () => BR.clearBrowserData(),

    // Docker & .env
    docker_info: () => DK.dockerInfo(),
    docker_containers: () => DK.listContainers(),
    docker_images: () => DK.listImages(),
    docker_stats: () => DK.containerStats(),
    docker_action: (a) => DK.containerAction(String(a.id), a.action),
    docker_rmi: (a) => DK.removeImage(String(a.id)),
    docker_db_connect: (a) => DK.connectContainerDb(ctx, String(a.id)),
    env_git_ignored: async (a) => {
      const r = await runCapture("git", ["check-ignore", "-q", "--", String(a.file)], { cwd: String(a.root), timeoutMs: 8000, env: gitEnv() }).catch(() => null);
      return r?.code === 0 ? true : r?.code === 1 ? false : null;
    },

    // HTTP / API client
    http_send: (a) => HTTP.sendHttp(ctx, String(a.id), a.req),
    http_cancel: (a) => HTTP.cancelHttp(String(a.id)),
    http_secrets: () => HTTP.listHttpSecrets(ctx),
    http_secret_set: (a) => HTTP.setHttpSecret(ctx, String(a.name ?? ""), typeof a.value === "string" ? a.value : null),

    // Khusus Electron: dialog, browser, jendela, clipboard
    dialog_open_folder: async (_a, win) => {
      const r = win ? await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"], title: "Pilih folder project" }) : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return r.canceled ? null : r.filePaths[0] ?? null;
    },
    dialog_open_file: async (a, win) => {
      const opts = { properties: ["openFile" as const], filters: Array.isArray(a.filters) ? a.filters : [] };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
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
    ide_start: (a) => ideServer(ctx, app.getVersion()).start(a.root ?? null, Array.isArray(a.folders) ? a.folders.filter((x: unknown): x is string => typeof x === "string") : []),
    ide_stop: () => {
      stopIde();
      return null;
    },
    ide_notify: (a) => {
      ideServer(ctx, app.getVersion()).notify(String(a.method), a.params);
      return null;
    },
    ide_reply: (a) => {
      ideServer(ctx, app.getVersion()).reply(Number(a.id), a.result, a.error === undefined ? undefined : String(a.error));
      return null;
    },
    ide_status: () => {
      const s = ideServer(ctx, app.getVersion());
      return { running: s.running, port: s.port, clients: s.clientCount() };
    },
    exthost_start: (a) => hostManager(ctx).start({ root: a.root ?? null, folders: Array.isArray(a.folders) ? a.folders.filter((x: unknown): x is string => typeof x === "string") : [], settings: a.settings ?? {}, core: a.core, trusted: a.trusted ?? [], disabled: a.disabled ?? [] }),
    exthost_stop: () => hostManager(ctx).stop(),
    exthost_call: (a) => hostManager(ctx).call(String(a.m), a.p),
    exthost_notify: (a) => {
      hostManager(ctx).notify(String(a.e), a.p);
      return null;
    },
    exthost_reply: (a) => {
      hostManager(ctx).reply(Number(a.id), a.result, a.error === undefined ? undefined : String(a.error));
      return null;
    },
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
    path_kinds: (a) =>
      (Array.isArray(a.paths) ? (a.paths as string[]).slice(0, 20) : []).map((p) => {
        try {
          const st = fs.statSync(p);
          return st.isDirectory() ? "dir" : st.isFile() ? "file" : null;
        } catch {
          return null;
        }
      }),
    path_exists: (a) => typeof a.path === "string" && fs.existsSync(a.path),
    path_is_dir: (a) => {
      try {
        return fs.statSync(a.path).isDirectory();
      } catch {
        return false;
      }
    },
  };
}
