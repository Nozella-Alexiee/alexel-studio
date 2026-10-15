<p align="center">
  <img src="docs/assets/alexel-studio-banner.svg" alt="Alexel Studio Banner" width="100%" />
</p>

<p align="center">
  <strong>The Next-Generation, Free &amp; Open Source AI Code Editor for macOS, Windows, and Linux.</strong><br/>
  Pair-program seamlessly with your favorite autonomous AI agents next to a real terminal, language servers, and a native debugger — with human-in-the-loop review for every single line of code.
</p>

<p align="center">
  <a href="https://github.com/Nozella-Alexiee/alexel-studio/releases/latest"><img src="https://img.shields.io/badge/Release-v0.3.0-blue?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release" /></a>
  <a href="#-supported-ai-agents"><img src="https://img.shields.io/badge/AI_Agents-Claude_·_Codex_·_Gemini_·_Antigravity-8B5CF6?style=for-the-badge" alt="AI Agents" /></a>
  <a href="#-download--installation"><img src="https://img.shields.io/badge/Platforms-macOS_·_Windows_·_Linux-38BDF8?style=for-the-badge&logo=apple&logoColor=white" alt="Cross-Platform" /></a>
  <a href="#-privacy--zero-telemetry"><img src="https://img.shields.io/badge/Telemetry-Zero_·_100%25_Private-10B981?style=for-the-badge" alt="Zero Telemetry" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-amber?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="README.md"><b>English</b></a> · <a href="README.id.md"><b>Bahasa Indonesia</b></a> · <a href="#-download--installation"><b>Download</b></a> · <a href="docs/AGENTS.md"><b>Agent Protocols</b></a> · <a href="CONTRIBUTING.md"><b>Contributing</b></a>
</p>

---

<p align="center">
  <img src="docs/screenshots/agent.jpg" alt="Alexel Studio Interface with Agent Review" width="100%" style="border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,0.28);" />
</p>

---

## 📑 Table of Contents

- [✨ Why Alexel Studio?](#-why-alexel-studio)
- [🤖 Supported AI Agents](#-supported-ai-agents)
- [📸 Feature Highlights](#-feature-highlights)
  - [1. Human-in-the-Loop Diffs & Granular Approval](#1-human-in-the-loop-diffs--granular-approval)
  - [2. Time-Travel Checkpoints & File History](#2-time-travel-checkpoints--file-history)
  - [3. Full-Featured Multi-Language Debugger (DAP)](#3-full-featured-multi-language-debugger-dap)
  - [4. Agent Store with Checksum Verification](#4-agent-store-with-checksum-verification)
  - [5. Familiar Developer Experience & Open VSX Themes](#5-familiar-developer-experience--open-vsx-themes)
- [📥 Download & Installation](#-download--installation)
- [🔒 Privacy & Zero Telemetry](#-privacy--zero-telemetry)
- [⌨️ Keyboard Shortcuts Reference](#️-keyboard-shortcuts-reference)
- [🛠️ Building from Source](#️-building-from-source)
- [📁 Project Layout](#-project-layout)
- [📄 License & Trademark Notice](#-license--trademark-notice)

---

## ✨ Why Alexel Studio?

Most AI-assisted editors treat artificial intelligence either as an opaque auto-complete tool or as a black-box that silently modifies files in the background without your oversight.

**Alexel Studio is built on a different principle: *You stay in the pilot seat.***

1. **Human-in-the-Loop Verification**: Every code edit, file creation, and shell command proposed by an agent is rendered as a crystal-clear visual diff card before anything touches your disk. Accept once, approve for the session, or decline with feedback.
2. **Time-Travel Checkpoints**: Every message in a conversation functions as an instant snapshot. Made a wrong turn? One click restores your entire working tree to the state before that message.
3. **No Vendor Lock-In**: Sign in directly with your own Claude, OpenAI, or Google account. You don't pay a markup on API calls, and you use the official CLI agents directly.
4. **Professional IDE Fundamentals**: You don't sacrifice core tools for AI. Alexel Studio includes a real pseudo-terminal (`node-pty`), Language Server Protocol (LSP) intelligence, and full Debug Adapter Protocol (DAP) debugging.
5. **Absolute Privacy**: Zero analytics, zero telemetries, and zero intermediary servers. Traffic flows exclusively between your machine and your chosen AI provider.

---

## 🤖 Supported AI Agents

Alexel Studio comes with out-of-the-box drivers for the industry's leading autonomous coding agents, as well as an open integration for any agent supporting the **Agent Client Protocol (ACP)**:

| Agent | Provider | Account Required | Connection Protocol | Permission Modes |
|---|---|---|---|---|
| **Claude Code** | Anthropic | Claude Pro or Team / Max | Stream-JSON CLI protocol | Ask first, Edit automatically, Plan |
| **Codex** | OpenAI | ChatGPT Plus or OpenAI Key | `codex app-server` (JSON-RPC) | Ask first, Auto in folder, Read-only |
| **Gemini** | Google | Google Account or Gemini Key | Agent Client Protocol (stdio) | Modes offered by agent |
| **Antigravity** | Google | Google Account | `agy` CLI Stream-JSON mode | Edit automatically, Plan, Strict |
| **Any ACP Agent** | Community | Provider specific | Agent Client Protocol (stdio) | Customizable via Settings |

> 💡 **Context Mentions**: Use `@problems`, `@terminal`, `@git-diff`, or `@open-editors` in any conversation prompt to automatically feed exact IDE context directly to the agent.

---

## 📸 Feature Highlights

### 1. Human-in-the-Loop Diffs & Granular Approval
> Every edit is highlighted inline with CodeMirror 6 syntax highlighting and side-by-side or unified diffs. Approve changes individually or ask the agent to iterate.

<p align="center">
  <img src="docs/screenshots/agent.jpg" alt="Interactive Agent Diff Review" width="92%" style="border-radius: 10px;" />
</p>

---

### 2. Time-Travel Checkpoints & File History
> Never lose working code again. Every user prompt creates an instant checkpoint, and every manual file save is recorded in local history for instant comparison and rollback.

---

### 3. Full-Featured Multi-Language Debugger (DAP)
> Complete Debug Adapter Protocol integration supporting breakpoints, variable inspection, watch expressions, call stacks, and an interactive debug console. Compatible with standard `.vscode/launch.json` configs.

<p align="center">
  <img src="docs/screenshots/debug.jpg" alt="Debugger at Breakpoint" width="92%" style="border-radius: 10px;" />
</p>

* **JavaScript / TypeScript**: Native `js-debug` integration
* **Python**: `debugpy` adapter
* **C / C++ / Rust**: `lldb-dap`
* **Go**: Delve debugger

---

### 4. Agent Store with Checksum Verification
> Install and manage your AI tools directly from the Extensions panel. Packages are fetched directly from official sources (Open VSX, npm registry, GitHub) with cryptographic checksum validation.

<p align="center">
  <img src="docs/screenshots/ext.jpg" alt="Extensions and Agent Store" width="92%" style="border-radius: 10px;" />
</p>

---

### 5. Familiar Developer Experience & Open VSX Themes
> Feels instantly familiar if you're coming from VS Code: command palette, customizable keymaps, activity bar, and hundreds of themes from Open VSX (rendered securely without executing extension JavaScript).

<p align="center">
  <img src="docs/screenshots/light.jpg" alt="Alexel Studio Light Theme" width="92%" style="border-radius: 10px;" />
</p>

---

## 📥 Download & Installation

Pre-built binaries for all major platforms are available on the [**Latest Releases**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) page:

| Operating System | Architecture | Installer Format | Download Link |
|---|---|---|---|
| **macOS** | Apple Silicon (M1/M2/M3/M4) | `.dmg` | [**Alexel-Studio-mac-arm64.dmg**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **macOS** | Intel x64 | `.dmg` | [**Alexel-Studio-mac-x64.dmg**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Windows** | 64-bit (x64) | `.exe` Installer | [**Alexel-Studio-win-x64.exe**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Windows** | ARM64 | `.exe` Installer | [**Alexel-Studio-win-arm64.exe**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Linux** | Debian / Ubuntu | `.deb` | [**Alexel-Studio-linux-amd64.deb**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Linux** | Fedora / RHEL / openSUSE | `.rpm` | [**Alexel-Studio-linux-x86_64.rpm**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |
| **Linux (Universal)** | All distributions | `.AppImage` | [**Alexel-Studio-linux-x86_64.AppImage**](https://github.com/Nozella-Alexiee/alexel-studio/releases/latest) |

### 💡 First-Run Security Notes
Because releases are community-built open-source binaries:
* **macOS**: On the first launch, right-click `Alexel Studio.app` in your Applications folder and click **Open**, then confirm.
* **Windows**: If Microsoft Defender SmartScreen appears, click **More info** followed by **Run anyway**.

---

## 🔒 Privacy & Zero Telemetry

We believe developer tools should strictly respect your privacy:

* **Zero Tracking**: No usage metrics, no heartbeat pings, no telemetry libraries.
* **No Cloud Middleman**: All conversations travel straight from your computer to the AI model's official endpoint via the vendor's own verified CLI.
* **Your Credentials Stay Yours**: Alexel Studio never requests, intercepts, or persists your passwords or API secrets.

---

## ⌨️ Keyboard Shortcuts Reference

Shortcuts dynamically map to your OS (`⌘` on macOS, `Ctrl` on Windows & Linux):

| Action | macOS | Windows / Linux |
|---|---|---|
| **Command Palette** | `⌘ ⇧ P` | `Ctrl + Shift + P` |
| **Quick Open File** | `⌘ P` | `Ctrl + P` |
| **Toggle AI Agent Panel** | `⌘ ⎋` | `Ctrl + Esc` |
| **Integrated Terminal** | `` ⌃ ` `` | `` Ctrl + ` `` |
| **Quick Fix / AI Fix** | `⌘ .` | `Ctrl + .` |
| **Start / Continue Debugging** | `F5` | `F5` |
| **Toggle Breakpoint** | `F9` | `F9` |
| **Step Over** | `F10` | `F10` |
| **Step Into** | `F11` | `F11` |

> Fully customizable under **Settings → Keyboard Shortcuts**.

---

## 🛠️ Building from Source

**Prerequisites:** Node.js 22 or later.

```bash
# 1. Clone repository
git clone https://github.com/Nozella-Alexiee/alexel-studio.git
cd alexel-studio

# 2. Install dependencies
npm install

# 3. Launch application in development mode
npm run app

# 4. Run test suites
npm test
```

### Packaging Distribution Installers:
* macOS: `npm run dist`
* Windows: `npm run dist:win`
* Linux: `npm run dist:linux`

---

## 📁 Project Layout

```
alexel-studio/
├── electron/                 # Main Process (Node.js & Electron APIs)
│   ├── agents/               # AI drivers: claude, codex, gemini, antigravity, acp
│   ├── debug/                # Debug Adapter Protocol (DAP) client & adapters
│   ├── lsp/                  # Language Server Protocol client implementations
│   └── terminal/             # Pseudo-terminal pty management
├── src/                      # Renderer Process (React 19 + TypeScript)
│   ├── agents/               # Chat UI, diff cards, checkpoint history
│   ├── editor/               # CodeMirror 6 engine, syntax trees, keymaps
│   ├── components/           # Activity bar, tabs, panels, statusbar
│   └── state/                # Application state, settings, open buffers
├── build/                    # App icons, metadata, and packaging assets
├── docs/                     # Architectural guides, agent specs, screenshots
└── site/                     # Official download website source
```

---

## 📄 License & Trademark Notice

Distributed under the [**MIT License**](LICENSE).

*Disclaimer: Claude Code is a trademark of Anthropic PBC. ChatGPT and Codex are trademarks of OpenAI. Gemini and Antigravity are trademarks of Google LLC. Alexel Studio is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, Google, or Microsoft.*

<p align="center">
  Crafted with care by <strong>Alex (Nozella-Alexiee)</strong> &amp; contributors 🐧<br/>
  <em>Code side-by-side with autonomous AI agents.</em>
</p>
