# Alexel Studio

A free, open source code editor for macOS, Windows and Linux. Work with the AI agent you prefer
(Claude Code, Codex, Gemini, Antigravity or any agent that speaks the Agent Client Protocol)
next to a real terminal, language servers and a debugger. Every change an agent proposes waits
for your approval.

[Bahasa Indonesia](README.id.md) · [Download](#download) · [Agents](docs/AGENTS.md) · [Contributing](CONTRIBUTING.md)

![An agent proposing an edit, with the diff waiting for approval](docs/screenshots/agent.jpg)

## Features

- **AI agents as extensions.** Install Claude Code, Codex or Gemini from the Extensions view.
  The official package is downloaded, its checksum is verified, and you sign in with your own
  account. Antigravity and other ACP agents are detected automatically.
- **You approve every change.** Edits and shell commands appear as cards with the exact diff or
  command. Allow once, allow for the session, or decline and tell the agent what to do instead.
  Pick the model, effort and permission mode per conversation; resume earlier conversations.
- **Debugger.** Breakpoints, variables, watch expressions, call stack and a debug console for
  JavaScript/TypeScript (js-debug), Python (debugpy), C/C++/Rust (lldb-dap) and Go (Delve).
  Reads `.vscode/launch.json`.
- **Feels like VS Code.** Activity bar, command palette (`⌘⇧P` / `Ctrl+Shift+P`), full menus,
  Source Control, Outline, Output, Problems, editable keyboard shortcuts and `settings.json`.
- **Real terminal.** zsh, bash or PowerShell with full-screen programs. Smart Run reads
  `package.json`, `Cargo.toml`, `go.mod` and more.
- **Language servers.** TypeScript and JavaScript work out of the box. Python, Rust, Go, C/C++,
  PHP and CSS work once their server is installed.
- **Open VSX themes.** Color themes, file icon themes, snippets and grammars. Extension code is
  never executed.
- **File history.** Every save is kept; compare and restore any version.

| | |
|---|---|
| ![Debugger paused at a breakpoint](docs/screenshots/debug.jpg) | ![Agents in the Extensions view](docs/screenshots/ext.jpg) |

## Download

Get the latest installer from the [Releases](../../releases/latest) page:

| System | File |
|---|---|
| macOS, Apple Silicon | `Alexel-Studio-mac-arm64.dmg` |
| macOS, Intel | `Alexel-Studio-mac-x64.dmg` |
| Windows x64 / ARM64 | `Alexel-Studio-win-x64.exe` / `Alexel-Studio-win-arm64.exe` |
| Debian, Ubuntu | `Alexel-Studio-linux-amd64.deb` |
| Fedora, openSUSE | `Alexel-Studio-linux-x86_64.rpm` |
| Any Linux | `Alexel-Studio-linux-x86_64.AppImage` |

Builds are not code-signed with a paid certificate yet:

- **macOS:** right-click the app in Applications and choose **Open** the first time.
- **Windows:** if SmartScreen warns about an unknown publisher, choose **More info**, then **Run anyway**.

## AI agents

Each agent signs in with its own account; Alexel Studio never asks for or stores credentials.

| Agent | Account | How it connects |
|---|---|---|
| Claude Code | Claude Pro or Max | stream-json protocol of the official CLI |
| Codex | ChatGPT or OpenAI API key | `codex app-server`, the protocol of the Codex VS Code extension |
| Gemini | Google account or Gemini API key | Agent Client Protocol (Gemini CLI) |
| Antigravity | Google account | `agy` CLI in stream-json mode |
| Other agents | depends on the agent | Agent Client Protocol; set the command in Settings |

See [docs/AGENTS.md](docs/AGENTS.md) for how each integration works and what data is sent.

## Keyboard shortcuts

Shortcuts follow your system: `⌘` on macOS, `Ctrl` on Windows and Linux. A few to start with:

| Action | macOS | Windows / Linux |
|---|---|---|
| Command palette | `⌘⇧P` | `Ctrl+Shift+P` |
| Open file | `⌘P` | `Ctrl+P` |
| Open the agent | `⌘⎋` | `Ctrl+Esc` |
| Terminal | ``⌃` `` | ``Ctrl+` `` |
| Start debugging / continue | `F5` | `F5` |
| Toggle breakpoint | `F9` | `F9` |

All shortcuts can be changed in **Settings → Keyboard shortcuts**.

## Privacy

There is no telemetry. Alexel Studio only connects to the network when you:

- send a message to an agent (to that agent's provider, through its own CLI),
- install an agent, debugger or theme (Open VSX, npm registry or GitHub, with checksums verified),
- check for updates (one request to GitHub Releases per day; can be turned off in Settings).

## Build from source

Requirements: Node.js 22 or later.

```bash
npm install
```

```bash
npm run app
```

```bash
npm test
```

Installers: `npm run dist` (macOS), `npm run dist:win`, `npm run dist:linux`. Releases are built
by GitHub Actions when a `v*` tag is pushed (see `.github/workflows/release.yml`).

Project layout:

| Folder | Contents |
|---|---|
| `electron/` | main process: files, terminal, Git, language servers, agents, debugger |
| `src/` | renderer: React UI, CodeMirror editor, panels |
| `site/` | download page (GitHub Pages) |
| `docs/` | documentation and screenshots |

## License

[MIT](LICENSE). Claude, Codex, Gemini and Antigravity are trademarks of their respective owners.
Alexel Studio is not affiliated with Anthropic, OpenAI, Google or Microsoft. Third-party
licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
