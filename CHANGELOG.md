# Changelog

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
