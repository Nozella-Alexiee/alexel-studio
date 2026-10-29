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
- **Workspace Trust**: a folder that contains run configuration (`.vscode/tasks.json`,
  `.vscode/launch.json`, `.alexel/run.json`), or that would be opened by trusted code extensions,
  starts in restricted mode until you trust it: the extension host is not started and the folder's run
  targets are hidden. Trusting a folder also trusts its sub-folders; profiles never carry trust.
- ripgrep (used by extensions such as Todo Tree) is bundled from the official release, pinned by
  version and SHA-256 in `scripts/ripgrep/targets.mjs`.
- A short, pinned list of language servers (YAML, Prisma, Dockerfile) can be installed in one click.
  They come from Open VSX, are pinned by version and SHA-256 in `electron/managedServers.ts`, only
  the server files are extracted, and they run as child processes after an explicit confirmation.
- The editor integration for agents (`electron/ide.ts`) listens on `127.0.0.1` only, requires a
  random per-launch token (`x-claude-code-ide-authorization`), and writes a lockfile readable only by
  you in `~/.claude/ide`. It can be switched off in Settings.
- Agent packages and debug adapters are downloaded from fixed sources and verified with
  SHA-256 or sha512 checksums before use.
- **Secrets** (database passwords, HTTP secrets) are encrypted with Electron `safeStorage` (macOS
  Keychain, Windows DPAPI, Linux libsecret) in `userData/secrets.json` (mode 0600). Without OS
  encryption they are kept in memory for the session only. Secret values are never sent to the
  renderer, written to project files, stored in history, or included in agent prompts; `@db` and
  "ask your data" send table/column names only. Detected credentials (from `.env`, compose files,
  container environments) are read in the main process.
- **Database safety**: DROP/TRUNCATE/ALTER/GRANT/REVOKE and DELETE/UPDATE without WHERE (and
  empty-filter Mongo deletes, FLUSHALL/FLUSHDB in Redis) require confirmation; read-only connections
  use read-only sessions on the server (PostgreSQL/MySQL) or a read-only SQLite handle. Table edits use
  parameterized statements keyed by the primary key.
- **HTTP client**: requests are sent from the main process to `http(s)` URLs only, with a timeout,
  cancel, and a 20 MB response limit. `{{$secret}}`/`{{$dotenv}}` are filled in there.
- **Browser tab**: a separate `persist:browser` session, sandboxed, no Node, no app preload (only a
  tiny preload that forwards `alert`/`confirm` to native dialogs); device permissions are denied;
  pop-ups open as new tabs; only `http(s)` and `about:blank` navigations are allowed.
- **Jupyter**: the local Jupyter Server listens on `127.0.0.1` with a random token per launch and stops
  when the app quits or the notebook tab closes.
- **Remote SSH** uses the system `ssh` with `BatchMode` and your own known_hosts; Alexel never accepts
  a host key for you. Targets that could be parsed as ssh options are rejected and remote paths are
  shell-quoted. The control socket lives in a per-user 0700 folder in `/tmp`.
- **Docker** actions go through the `docker` CLI; removing containers/images and `compose down`
  require confirmation.
- Agents run with the permission mode you choose; Alexel Studio never passes flags that bypass
  an agent's permission checks.
