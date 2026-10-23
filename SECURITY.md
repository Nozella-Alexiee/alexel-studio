# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Security → Report a vulnerability** on this repository to send a private report. We aim to
reply within a week.

## Design notes

- The renderer has no Node.js access; it talks to the main process through a small, validated
  command bridge (`electron/preload.ts`, `electron/commands.ts`).
- Extensions from Open VSX always contribute data (themes, icons, snippets, grammars, language
  configuration). Extensions that also contain code (`main`) run in a separate **extension host**
  process (Electron's bundled Node, `electron/exthost/`) **only after you explicitly trust that
  extension** (per extension, revocable in the Extensions panel). Like VS Code, that code runs with
  your user's permissions: it can read/write files and use the network. The renderer never gets Node
  access; the host talks to the editor only through a small RPC. Webviews run in sandboxed iframes on
  a separate origin (`nozelweb://`) and can read local files only from folders the panel was allowed.
  Packages are extracted path-safely, with file-count and size limits; SHA-256 from Open VSX is
  verified when published. There is no code signing, so only trust publishers you know.
- A short, pinned list of language servers (YAML, Prisma, Dockerfile) can be installed in one click.
  They come from Open VSX, are pinned by version and SHA-256 in `electron/managedServers.ts`, only
  the server files are extracted, and they run as child processes after an explicit confirmation.
- The editor integration for agents (`electron/ide.ts`) listens on `127.0.0.1` only, requires a
  random per-launch token (`x-claude-code-ide-authorization`), and writes a lockfile readable only by
  you in `~/.claude/ide`. It can be switched off in Settings.
- Agent packages and debug adapters are downloaded from fixed sources and verified with
  SHA-256 or sha512 checksums before use.
- Agents run with the permission mode you choose; Alexel Studio never passes flags that bypass
  an agent's permission checks.
