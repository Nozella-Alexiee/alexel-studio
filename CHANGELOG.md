# Changelog

## 1.0.1

A maintenance release that closes the findings left open by the 1.0.0 audit. No new features.

**Security**

- Extension installs now enforce a checksum policy: when Open VSX provides a SHA-256 it must match;
  when it says one exists but it can't be fetched (network error, timeout, bad status or content), the
  install is cancelled with a "try again" message before the package is downloaded. Packages that
  Open VSX publishes without a checksum still install, marked as unverified, with a warning in Output.
- Open VSX metadata requests time out after 20 seconds and package downloads after 10 minutes, with a
  clear error instead of hanging.
- Extension webview resources (`nozelweb://`) are checked against the real path on both sides:
  symlinks inside an extension that point outside its folders are rejected, while symlinked
  `node_modules` (pnpm) and linked extension folders keep working.
- HTTP client history is stored from the request template (before `{{variables}}` are filled in), so
  private environment values and response tokens are no longer written to local storage. Sensitive
  header values (Authorization, Cookie, API keys, tokens) and query parameters are cleared unless
  they are placeholders; existing history entries are cleaned when loaded.

**Stability**

- `alert()`/`confirm()`/`prompt()` in a browser tab no longer freezes the main process: the dialog is
  asynchronous, only the page waits for the answer, and closing the tab cancels the dialog.
- Replace in Files runs user regexes with a time limit. A pattern that is too slow cancels the whole
  replace before any file is written.
- The update check follows semver precedence for pre-releases (`1.0.0-rc.2` < `1.0.0`, `rc.10` > `rc.2`);
  users on a stable version are not offered pre-releases.
- File history no longer fails when a snapshot is deleted while the list is being read.
- A notebook kernel that finishes starting after its tab was closed is shut down instead of left running.
- Errors from keyboard-shortcut commands are shown as an error toast instead of being lost.
- New regression tests cover the file watcher unwatch race, debug child sessions that fail to
  connect, and the architecture of bundled native terminal binaries for each installer target.

**Editor**

- Renaming or moving an open file reconnects everything tied to its path: language server, linter,
  debug gutter and breakpoints, Emmet/snippets, extension features, Git gutter and blame. Edits,
  selection and undo history are kept.
- Opening the same file twice at the same moment creates one document instead of two.
- Dragging the minimap ends correctly when the pointer is cancelled or loses capture.

**Panels**

- Terminal links: files created after a line was printed become links after a short delay, and
  `~/…` paths resolve to the home folder.
- HTTP client: a slow response from an earlier send no longer overwrites the newer one.
- Language server install/remove, query history, `.gitignore`/`.env.example` actions and cancelling
  the commit message agent now show an error when they fail.
- Search and extension install errors are translated.

## 1.0.0

The first stable release. No new features: every part of the app was audited and the bugs found were
fixed, with regression tests for most of them.

**Security**

- Exporting MongoDB/Redis results to CSV/JSON no longer runs write commands (`deleteMany`, `DEL`,
  `runCommand`, `aggregate` with `$out`/`$merge`) without confirmation; read-only MongoDB connections
  also block `aggregate` with `$out`/`$merge`.
- Production database connections now check every statement: `SELECT 1; UPDATE …`, writing CTEs,
  `findOneAndUpdate` and multi-line Redis input with a write command all ask for confirmation.
- Imported profiles can no longer add trusted folders (Workspace Trust) or a custom ACP agent command.
- A mistyped `gitBot` value in `settings.json` no longer turns on auto-commit; `powerMode`, `accent`
  and `confirmDelete` are validated too.
- Switching branches never treats a branch name as a file path (which could discard that file's changes).
- Markdown preview images can't point outside the project through `../`; `file:`/`javascript:` links
  are ignored. Links in notebook cells no longer navigate the app window.
- Docker IDs starting with `-` and unknown container actions are rejected; SSH hosts named `.`/`..`
  are rejected; IPC command names can't reach object prototype properties.

**Stability**

- The main process no longer crashes when Jupyter or the extension host can't be started, or when a
  kernel WebSocket fails. Simultaneous Jupyter starts share one server; servers that never become
  ready are stopped.
- Extension RPC replies that can't be sent are answered with an error instead of hanging until timeout.
- Saving the same file twice at once no longer fails, and a failed write (disk full) leaves no temp file.
- Fixed races in the IDE server start (lockfile with port 0), update download (double click deleted
  the running download), file watcher (watching resumed after unwatch), debug child sessions and
  terminals closed while still starting (orphaned processes).
- macOS: `alexel .` and opening a file with no window open now open a window; browser tabs are
  destroyed with their window.
- Failed browser tabs, kernel restarts, run targets, formatters and SSH actions now show an error
  instead of failing silently; stopping a debug session while it starts no longer hangs. Remaining
  unhandled promise rejections are logged to Output.

**Editor**

- Renaming or moving a file with unsaved edits keeps the edits and undo history; image, PDF and binary
  tabs follow renames and close on delete.
- Stale agent reviews no longer come back when a file is reopened.
- Broken glob patterns from extensions (`*.{ts`, `[z-a]`) no longer throw.
- Corrupt `session.json` entries no longer stop session restore; file names like `..notes` are treated
  as inside the project; long code snapshots are capped at 400 lines.
- `deno.jsonc` tasks with comments are detected; language server URIs with a stray `%` are handled.

**Panels**

- The SSH terminal command uses PowerShell quoting on Windows, as do Docker panel commands.
- Image and hex viewers no longer show a previous file after switching quickly.
- More UI text is translated, and extension alternatives mention the built-in Remote SSH and Docker panel.

## 0.9.0

The tools you usually open next to your editor are now built in. This release also contains
everything listed under 0.8.0, which was not published separately.

- **Database client**: PostgreSQL, MySQL/MariaDB, SQLite, MongoDB and Redis. A Database panel
  (connection → schema → table → columns), one-click connections found in `.env`, Prisma,
  docker-compose and SQLite files, table tabs with paging, sorting, per-column filters, cell editing
  and add/delete row (primary-key based, confirmed), CSV/JSON export, a query console and `.sql`
  files that run the statement under the cursor with Mod+Enter, schema autocomplete, cancel, history,
  and an ER diagram (save as SVG). Risky statements (DROP, TRUNCATE, ALTER, DELETE/UPDATE without
  WHERE) need confirmation; read-only connections are enforced by the server; production
  connections are marked. Passwords are encrypted with the OS keychain.
- **AI for databases**: "Ask your data" turns a question into a query (shown, never run
  automatically), plus Explain and Optimize; `@db` gives an agent the schema of connected databases
  (no data, no passwords).
- **HTTP/API client**: `.http`/`.rest` files with "Send request" above each request, environments
  (`http-client.env.json`, `.private`, `rest-client.environmentVariables` in `.vscode/settings.json`), chained requests
  (`{{login.response.body.$.token}}`), dynamic variables, `{{$secret NAME}}` and `{{$dotenv NAME}}`
  resolved in the main process only; a request builder (params, headers, Bearer/Basic auth, JSON/form
  body), cURL import/export, response viewer (pretty JSON, tree, headers, HTML preview, images),
  history; AI can write `.http` requests from your route code.
- **Docker panel**: containers grouped by compose project, start/stop/restart/pause/remove, logs and
  shell in the terminal, CPU/memory stats, images, compose up/down/logs; database containers connect to
  the Database panel with the credentials from their environment.
- **.env manager**: edit `.env*` files as a table (comments and order kept, secret values masked),
  missing keys compared with `.env.example`, a warning with a one-click fix when `.env` is not
  git-ignored, and "Create .env.example" without values.
- **Browser tab**: a real browser (separate `persist:browser` session, sandboxed, no Node) with an
  address bar, device presets (iPhone, Pixel, iPad), DevTools, page screenshots; ports from the Ports
  and Docker panels open in it; page errors go to Output; `alert`/`confirm` use native dialogs.
- **Jupyter notebooks**: `.ipynb` opens as a notebook (code & markdown cells, outputs, images, HTML
  tables, errors) and runs cells on a local Jupyter Server found in the project's `.venv`/`venv` or
  PATH; saved in Jupyter's own format.
- **Remote SSH (lite)**: browse and edit files on a server through your system `ssh`
  (`~/.ssh/config`, agent, keys, known_hosts), saving uploads the file atomically, SSH terminals per
  host or folder. Language servers and extensions still run locally.
- New website with the interactive Nozi.

## 0.8.0

Closing everyday gaps for a full-featured IDE:

- **Git**: stash (list/push/apply/pop/drop), fetch, merge, rebase, cherry-pick and revert with a
  conflict banner (Continue / Abort), branch rename/delete, tags, stage or revert a single change from
  the editor gutter, current-line blame (optional), a commit graph for all branches, and a commit view
  with per-file diffs.
- **Editor**: indent guides, bracket pair colorization, Emmet (HTML/CSS/JSX, via the MIT `emmet`
  library), color swatches with a picker, sticky scroll, pinned tabs, split terminal, PDF preview and a
  read-only hex viewer for binary files.
- **Extensions**: CodeLens, inlay hints, document highlights, links (Cmd/Ctrl+click), folding ranges,
  color providers and inline completions (ghost text) are now shown in the editor; a **Tests** view
  for `vscode.tests` controllers; extension tasks (`vscode.tasks`) in Smart Run; ripgrep is bundled.
- **Official Claude Code & Codex extensions** look as their authors intended: each gets its own tab in the right
  panel (with its icon), activity-bar views (e.g. Claude Code sessions) get a rail icon, webviews get
  the full `--vscode-*` theme (700+ colors), and the reported API version is 1.106 so both use their
  secondary-sidebar layout.
- **Workspaces**: open `.code-workspace` files, several folders in the Explorer, search and Quick Open
  across all folders; save the workspace as a file.
- **Profiles**: save settings & shortcuts as named profiles, export/import them as JSON (with the
  extension list).
- **Workspace Trust** (light): folders with tasks/launch/run configuration open in restricted mode until
  you trust them; code extensions don't run there.
- **Accessibility**: labelled inputs, high-contrast (forced colors) support, and a static check that
  every icon button, input and image has an accessible name.
- **More AI extensions work as intended**: Cline, Roo Code, Continue and Kilo Code get their own
  activity-bar panels with icons; extension titles are translated from `package.nls.json`; webviews get
  the default webview styles, every `--vscode-*` color they use, and light/dark color schemes;
  `context.extension` is a full Extension object; the default Dark/Light Modern themes are available to
  extensions; node-pty is provided to extensions.
- **Extension images**: catalog icons (served from openvsx.eclipsecontent.org) and README images show up.
- New download page design.
- Fixes: `.txt` files are `plaintext` for extensions; an old extension host exiting late no longer
  clears the new host's UI; extension-host webview load race; completion offsets after import edits.

## 0.7.0

Extensions that look and behave as intended:

- **The official Claude Code and Codex extensions run in Alexel Studio** with their own UI (chat
  panel in an editor tab or the right-hand "Extension views" panel). Cline,
  Continue and Roo Code activate too. Installing picks the package built for your OS/architecture
  (they ship their own CLI binary, 100+ MB), extracted in a child process so the app stays responsive.
  Webviews run in sandboxed, per-extension origins. Experimental: not every extension feature works,
  and Codex is not on Open VSX for Windows.

- **Extension host** (experimental): extensions that contain code run in a separate Node process with a
  growing subset of the `vscode` API, *only after you trust them*. Verified with the real Prettier,
  ESLint, Red Hat YAML, Prisma, Error Lens, Todo Tree, REST Client, Code Spell Checker, Markdown All in
  One, Rainbow CSV, Tailwind CSS and Live Server. Covers commands & keybindings, status bar items,
  messages/quick pick/input box, completion, hover, definition, references, rename, formatting, code
  actions, diagnostics, decorations (Error Lens), settings, tree views, webviews, language-client
  based extensions, ESM extensions.
- Extension details page with **Details / Features / Changelog**, extension icons, per-extension
  **settings UI** (`contributes.configuration`), **recommendations for your project**, trust control,
  runtime status, and an "Extension views" sidebar for tree views.
- Pinned one-click language servers (YAML, Prisma, Dockerfile) and built-in Prettier remain.

Editor integration for agents:

- **Claude Code in the Alexel Studio terminal** now connects to the editor: it sees your
  selection, open files and problems, can open files, and shows diffs for you to accept or reject.
  Localhost-only MCP server with a random token + `~/.claude/ide` lockfile (`electron/ide.ts`); `claude`
  in any Alexel terminal auto-connects; **Cmd/Ctrl+Alt+K** sends the file/selection as an @-mention.
  (The panel's stream mode can't attach IDE servers, so the panel keeps sending its own context.)
- **Fast** and **Thinking** switches for Claude Code, applied live.

Run:

- File links in the terminal (`src/a.ts:12:5`, `a.ts(12,5)`, Python tracebacks, Rust `-->`) open on
  Cmd/Ctrl+click.
- Run targets from `.alexel/run.json`, `.vscode/tasks.json` and `.vscode/launch.json` (Node/Python).

Fixed/polish: Run & Debug in Zen/Control, TODO and Outline in the Studio rail, status bar no longer
clips on narrow windows, Tuxedo double borders.

## 0.6.2

New:

- **One-click language servers** for **YAML**, **Prisma** and **Dockerfile** (Settings → Language
  servers, or right after installing the matching extension from the catalog): autocomplete, hover,
  and diagnostics, no terminal install. Each is a pinned Open VSX package (version + SHA-256 are
  checked against values reviewed in this repo), only the server files are extracted, and you confirm
  before anything runs. Extension code (`extension.js`) is still never run.
- LSP client now answers server→client requests (`workspace/configuration`,
  `client/registerCapability`, …) instead of returning "method not found", which crashed some servers.
- Catalog badge **Full + language server** for those extensions.

## 0.6.1

New:

- **Update from inside the app.** When a new version is out, the notification now has **Install
  update**: the right installer for your system is downloaded from the GitHub release, checked
  against the SHA-512 in that release's `latest*.yml`, and installed when you restart (you are asked
  about unsaved files first). Windows: silent NSIS installer; macOS: the `.app` is replaced from the
  release zip; Linux: AppImage is replaced in place (deb/rpm keep using your package manager).
  Settings → General → *Check now*, or Help → Check for updates.
- Builds are still unsigned, so integrity rests on the checksum from the repository's own release.

Versions up to 0.6.0 can't update themselves: install 0.6.1 once from the Releases page, then updates
come from inside the app.

## 0.6.0

Extensions are no longer a short, category-locked list:

- **Search all of Open VSX** (20,000+) with no forced category; categories are now optional chips
  (All, Themes, Icons, Languages, Snippets, Formatters, Linters, Keymaps), plus sorting (relevance,
  downloads, rating, newest), a result count, and "Load more" paging.
- **A recommendations home**: popular themes, icon themes, languages and snippets without searching.
- **Compatibility badge before you download** (Full / Partial / Needs extension code), computed from
  the extension's `package.json` (a few KB) instead of failing after a 60 MB download. Unsupported
  results can't be installed and point to the built-in alternative (Prettier, Git panel, AI agents…).
- **Extension details tab**: README, changelog, rating, license, and a version picker.
- **Manage extensions**: Installed tab with enable/disable, update check with "Update all", atomic
  installs (a failed install leaves the previous version intact).
- **Language configuration** (`language-configuration.json`) is now read: comment toggling and
  bracket auto-closing work for TextMate-based languages (Svelte, Prisma, …), and extensions that only
  provide it can be installed.
- **Prettier built in**: Shift+Alt+F formats JS/TS, JSON, CSS/SCSS/Less, HTML, Markdown, YAML (uses
  `.prettierrc`); new "Format on save" setting.

Extension code is still never executed.

## 0.5.1

Fixed, in all eight designs:

- **Text contrast.** Every design now meets WCAG AA (4.5:1 text, 3:1 UI) for muted/subtle text, accents,
  line numbers, comments, terminal colors and warnings — checked by a test (`scripts/contrast.mjs`).
  Zen and Kawanan primary buttons and accent text were the worst offenders.
- **Selection is visible on the active line** (the active-line tint is now translucent).
- **Control and Tuxedo panels had stray padding** (a shared `.tile` class collided with the Dashboard);
  Dashboard tiles keep their border in Tuxedo.
- **Windows/Linux had no menu bar** in Aurora, Antartika, Zen, Kawanan, Control and Tuxedo: a ☰ menu
  now sits in the title bar (and replaces the menu bar in narrow Studio windows).
- **Settings, Split and Markdown/HTML Preview buttons** are reachable from the Aurora/Zen/Kawanan title bars.
- **Switching design or extension theme** no longer leaves the terminal on the old font, the editor on
  the old colors, or the window buttons in the wrong scheme.
- **Narrow windows:** sidebar and right panel shrink to keep the editor usable; the right panel hides
  when it cannot fit.
- Aurora/Antartika sidebar tabs no longer clip and include Run & Debug and Outline.
- Kawanan no longer doubles the gap between cards; its Markdown preview and chat use its own font.
- Light designs get a readable warning squiggle; Control uses the bundled mono font; Windows UI font
  fallbacks; toasts no longer cover the agent composer; Zen shows CRLF in the status bar.
- Settings: layout thumbnails match the real layouts; the Nozi sidebar row only shows for Antartika.

## 0.5.0

New:

- **Ultracode** switch under Effort (shown when the agent CLI reports it available), applied live.
- **Effort follows the model.** Each model lists its own levels; models without effort hide the
  control; stored values a model doesn't support are no longer sent. The Codex-only "Ultra" level is
  gone from the other agents. Codex efforts are validated against the model's list.
- **Auto permission mode** (when the model and CLI support it); the mode list is limited to what the
  CLI's `--help` reports, so a mode the CLI would reject is never offered.
- **Effort changes apply to the running conversation** instead of restarting the process.
- **The agent starts when the panel opens**, so models, Ultracode and modes are correct before your
  first message.
- **Slash commands reach the agent untouched** (they used to be wrapped in file context and treated as
  plain text). `/ultracode` toggles Ultracode; Gemini's own slash commands show up in the `/` list.
- Antigravity gets an **Auto** mode.
- **Dangerous modes are opt-in:** Bypass permissions / full access / yolo only appear after enabling
  *Allow dangerous mode* in Settings (with a confirmation), never as the starting mode, and the
  desktop side refuses them otherwise. They are also left out of the Shift+Tab cycle.

## 0.4.1

Fixed:

- **File tree didn't scroll** in the default (Studio) and Control layouts.
- **Debug Console, Output and the agent chat can be selected and copied.** Right-click gives Copy /
  Copy all / Select all (and Clear in the Debug Console); Problems and Variables rows have Copy menus.
  Edit → Copy no longer jumps into the editor when the selection is elsewhere.
- **Antigravity sign-in.** The panel now detects when you're signed out and shows **Sign in**; signing
  in opens `agy` in a terminal and re-checks when you finish. A headless run that hits the OAuth wall
  stops with a clear error instead of hanging.
- **Run on Windows:**
  - PATH is read from the registry and refreshed, so tools installed after Alexel Studio started
    (winget, installers) are found; common install folders (Python, LLVM, MSYS2, Go, Git, .NET) are searched.
  - The terminal and Run use `-ExecutionPolicy Bypass`, so npm/npx work on stock Windows.
  - Python: `py -3`, a real `python.exe` (not the Microsoft Store stub) or the project's `.venv`; debugpy too.
  - New runners: `.ps1`, `.bat`/`.cmd`, `.sh` via Git Bash, `.cs`; gcc before clang; a unique temp `.exe` per run.
  - Exit codes are passed through; Stop is no longer reported as a failure; Ctrl+C copies when text is selected, Ctrl+V pastes.
  - ConPTY handles are released; the terminal explains itself if the shell never starts.
  - Ports → Stop uses `/F` and reports failures; the stray `Alexel-Studio-win.exe` installer is gone.
- **Run everywhere:** a missing toolchain now shows what to install instead of a doomed command; Run
  keeps focus in the editor so shortcuts keep working; running a server again restarts it; a failed
  save, a broken `launch.json` or an unsupported debug type is reported instead of silently ignored;
  the debugger passes `cwd`/`env` to integrated-terminal sessions.

## 0.4.0

New:

- **Checkpoints.** Every message to an agent is a checkpoint. "Restore files to before this
  message" puts back every file the agent changed since then; files it created go to the Trash.
  Works with every agent.
- **Review agent changes in the editor.** Changed parts are highlighted with Accept / Reject per
  part, plus Accept all / Reject all. A "files changed" card closes each turn.
- **AI commit messages.** ✨ in Source Control writes a message from the staged diff, following
  the style and language of your recent commits. Lockfiles and secret-looking files are not sent.
- **More context.** `@problems`, `@terminal`, `@git-diff` and `@open-editors` in the message box.
- **Fix with AI** from the Problems panel, the error tooltip, the editor context menu or `⌘.` / `Ctrl+.`.

Fixed:

- Windows: Gemini installed with npm (`gemini.cmd`) now starts; agent file paths open the right
  tab; Discard removes new files; Edit → Paste/Undo work in text fields; AltGr characters no
  longer trigger shortcuts; the AI panel shortcut is `Ctrl+Alt+I` (Ctrl+Esc opens the Start menu).
- Linux: commands no longer hang after a timeout; the Linux design shortcut no longer clashes
  with GNOME's terminal shortcut.
- The main process no longer crashes when an agent or language server exits mid-write.
- Closing the window on macOS stops agents, terminals, debuggers and language servers.
- Agent packages are extracted safely on every OS; registry versions are validated.
- A slow search regex can no longer freeze the app.
- Switching agents from `settings.json` closes the old session; Reset applies shortcuts and themes.
- Conversation history follows the selected agent; pending cards close when a turn ends.
- Git status recovers when you switch projects quickly; projects behind symlinks get file decorations.
- The English interface is complete, including prompts sent to agents.


## 0.3.0

First open source release under the name **Alexel Studio** (previously Nozel Code).

- AI agent panel for Claude Code, Codex, Gemini, Antigravity and any ACP agent, with
  approval cards that show diffs, model / effort / permission mode pickers, conversation
  history, @-mentions, images and streaming replies.
- Agents install from the Extensions view (official packages, checksums verified).
- Debugger (Debug Adapter Protocol) for JavaScript/TypeScript, Python, C/C++/Rust and Go.
- Classic IDE layout (Studio Dark and Studio Light), full menus on every platform, command
  palette, Outline, Output, editable shortcuts and `settings.json`.
- Shortcuts shown for your platform (⌘ on macOS, Ctrl on Windows and Linux).
- Builds for macOS (Apple Silicon, Intel), Windows (x64, ARM64) and Linux (AppImage, deb, rpm).
- Optional daily update check against GitHub Releases.
- Settings and history from Nozel Code are migrated automatically.
