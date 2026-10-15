# AI agents in Alexel Studio

Alexel Studio runs each agent through its official command-line program and shows the
conversation in one panel. The panel speaks one internal format; every agent driver in
`electron/agents/` translates its own protocol into it.

## What is sent where

- Your message, the files or selection you attach, and the files the agent reads go to the
  agent's provider (Anthropic, OpenAI or Google), through that provider's own CLI, using the
  account you signed in with. Alexel Studio has no server of its own.
- Alexel Studio never asks for, reads or stores your credentials. Each CLI keeps its own login.
- The first time you send a message, you confirm this once. You can also turn on
  **Settings → Agent AI → Show content before sending** to review every message.

## Permission modes

| Agent | Modes |
|---|---|
| Claude Code | Ask first (default), Edit automatically, Plan |
| Codex | Ask first (default), Automatic in this folder, Read only |
| Gemini, ACP agents | modes offered by the agent |
| Antigravity | Edit automatically, Plan, Strict |

In **Ask first**, each edit and shell command appears as a card. Edits show a diff of the
change before it is written. You can allow once, allow for the rest of the session, or
decline with a note for the agent. Antigravity's CLI cannot ask the editor for permission, so
actions it is not allowed to take are reported in the chat instead.

## Installing agents

| Agent | Source | Verification |
|---|---|---|
| Claude Code | Open VSX `anthropic.claude-code` (platform build) | SHA-256 from Open VSX |
| Codex | Open VSX `openai.chatgpt` (platform build) | SHA-256 from Open VSX |
| Gemini | npm `@google/gemini-cli` | sha512 integrity from the npm registry |
| Antigravity | the Antigravity app (`~/.gemini/bin/agy`) | installed by Google's installer |

Only the agent binary is extracted from an extension package; the extension's JavaScript is
never unpacked or run. If an agent is already installed on your system (for example
`claude` or `codex` on your PATH), it is used directly. Gemini runs on the Node.js runtime
built into Alexel Studio, so Node.js does not need to be installed.

Codex is not published for Windows on Open VSX; on Windows install it with
`npm install -g @openai/codex`.

## Protocols

| Agent | Protocol | Driver |
|---|---|---|
| Claude Code | `claude -p --input-format stream-json --output-format stream-json`, permission prompts answered by the host | `electron/claude.ts` |
| Codex | `codex app-server` (JSON-RPC per line), the protocol of the Codex VS Code extension | `electron/agents/codex.ts` |
| Gemini, ACP | [Agent Client Protocol](https://agentclientprotocol.com) over stdio | `electron/agents/acp.ts` |
| Antigravity | `agy --print= --input-format stream-json --output-format stream-json` | `electron/agents/antigravity.ts` |

## Adding another agent

Any agent that supports the Agent Client Protocol works without code changes: choose
**Agen ACP** in the panel and set its command in **Settings → Agent AI**. To add a built-in
agent, write a driver that implements `AgentDriver` in `electron/agents/index.ts` and add an
entry to `src/agents/registry.ts`.
