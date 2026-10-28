# Changelog

## Unreleased

Closing the everyday gaps with VS Code:

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
- **Official Claude Code & Codex extensions** look like in VS Code: each gets its own tab in the right
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
- Fixes: `.txt` files are `plaintext` for extensions; an old extension host exiting late no longer
  clears the new host's UI; extension-host webview load race; completion offsets after import edits.

## 0.7.0

Extensions that look and behave like VS Code's:

- **The official Claude Code and Codex extensions run in Alexel Studio** with their own UI (chat
  panel in an editor tab or the right-hand "Extension views" panel), like in VS Code. Cline,
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

- **Claude Code in the Alexel Studio terminal** now connects to the editor like in VS Code: it sees your
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
- VS Code-style layout (Studio Dark and Studio Light), full menus on every platform, command
  palette, Outline, Output, editable shortcuts and `settings.json`.
- Shortcuts shown for your platform (⌘ on macOS, Ctrl on Windows and Linux).
- Builds for macOS (Apple Silicon, Intel), Windows (x64, ARM64) and Linux (AppImage, deb, rpm).
- Optional daily update check against GitHub Releases.
- Settings and history from Nozel Code are migrated automatically.
