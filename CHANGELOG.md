# Changelog

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
