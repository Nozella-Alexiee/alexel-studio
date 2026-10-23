# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Security → Report a vulnerability** on this repository to send a private report. We aim to
reply within a week.

## Design notes

- The renderer has no Node.js access; it talks to the main process through a small, validated
  command bridge (`electron/preload.ts`, `electron/commands.ts`).
- Extensions from Open VSX contribute data only (themes, icons, snippets, grammars, language
  configuration). Their code is never extracted or executed; compatibility is decided from the
  extension's `package.json` before anything is downloaded.
- A short, pinned list of language servers (YAML, Prisma, Dockerfile) can be installed in one click.
  They come from Open VSX, are pinned by version and SHA-256 in `electron/managedServers.ts`, only
  the server files are extracted, and they run as child processes (Electron's bundled Node) after
  an explicit confirmation. Anything else from an extension is never executed.
- Agent packages and debug adapters are downloaded from fixed sources and verified with
  SHA-256 or sha512 checksums before use.
- Agents run with the permission mode you choose; Alexel Studio never passes flags that bypass
  an agent's permission checks.
