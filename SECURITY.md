# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Security → Report a vulnerability** on this repository to send a private report. We aim to
reply within a week.

## Design notes

- The renderer has no Node.js access; it talks to the main process through a small, validated
  command bridge (`electron/preload.ts`, `electron/commands.ts`).
- Extensions from Open VSX contribute data only (themes, icons, snippets, grammars). Their code
  is never extracted or executed.
- Agent packages and debug adapters are downloaded from fixed sources and verified with
  SHA-256 or sha512 checksums before use.
- Agents run with the permission mode you choose; Alexel Studio never passes flags that bypass
  an agent's permission checks.
