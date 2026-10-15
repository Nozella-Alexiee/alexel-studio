# Contributing to Alexel Studio

Thanks for helping. Bug reports, fixes, translations and new agent drivers are all welcome.

## Getting started

```bash
npm install
```

```bash
npm run app
```

`npm run app` starts Vite and Electron with hot reload for the renderer.

## Before opening a pull request

```bash
npm run typecheck
```

```bash
npm test
```

- Keep changes focused; one topic per pull request.
- Match the surrounding code: naming, comment density and formatting.
- User-facing text is currently written in Indonesian; keep new strings short and plain.
- Do not add telemetry or network calls that the user did not ask for.
- Never execute code from extensions, and never pass flags that skip an agent's permission checks.

## Where things live

| Area | Files |
|---|---|
| Agents | `electron/agents/*`, `electron/claude.ts`, `src/claude/*`, `src/agents/registry.ts` |
| Debugger | `electron/dap.ts`, `src/debug/*` |
| Editor | `src/editor/*` |
| Menus & commands | `src/app/commands.ts`, `src/app/menus.ts` |
| Layout | `src/shells/*`, `src/styles/*` |

## Reporting bugs

Use **Help → Report an issue** in the app (it fills in your version and OS), or open an issue
with steps to reproduce. For security problems, see [SECURITY.md](SECURITY.md).
