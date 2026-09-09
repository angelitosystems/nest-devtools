# CLI

The `@angelitosystems/nest-devtools-cli` package provides the `nest-devtools` binary and the local DevTools server.

## Installation

```bash
# one-off
npx @angelitosystems/nest-devtools-cli

# global install
bun add -g @angelitosystems/nest-devtools-cli
npm install -g @angelitosystems/nest-devtools-cli
```

## Commands

### `nest-devtools` / `nest-devtools start`

Starts the DevTools server:

- `http://localhost:4317` — dashboard (static files) + `/health`
- `ws://localhost:4318` — SDK endpoint (`?projectId=<id>` for apps, `?client=dashboard` for UIs)

Options: `--port <n>` (dashboard), `--ws-port <n>` (SDK), `--host <h>`.

The server holds **no** captured secrets on disk — everything lives in memory, bounded by ring buffers.

### `nest-devtools status`

Exits `0` and prints a check when the server responds on `/health`.

### `nest-devtools projects`

Lists known projects with connection dots. For live data, the dashboard is the source of truth.

### `nest-devtools logs`

Explains how to stream logs (the dashboard is the interactive log explorer in v0.1).

### `nest-devtools doctor`

Diagnoses the environment:

- Node version and runtime compatibility (Node/Bun),
- DevTools server reachable (HTTP) and SDK endpoint accepting connections (WS),
- NestJS project detected (`main.ts` present) when run from an app root.

Exit code `1` if any check fails — useful in CI or onboarding.

### `nest-devtools init`

Modifies `src/main.ts` (or `main.ts`):

1. adds `import { NestDevTools } from '@angelitosystems/nest-devtools';`,
2. inserts `NestDevTools.init(app);` right after `NestFactory.create(...)`.

Idempotent: skips when the import is already present.

### `nest-devtools --version` / `--help`

## Ports

| Port | Purpose |
|---|---|
| **4317** | Dashboard HTTP + `/health` |
| **4318** | SDK WebSocket endpoint |

Change with `nest-devtools start --port 4319 --ws-port 4319` (or set `NEST_DEVTOOLS_URL` in your app accordingly).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port already in use | `nest-devtools start --port 4319` or kill the stale process |
| App not appearing | Check `NEST_DEVTOOLS_URL`, run `nest-devtools doctor` |
| Dashboard empty | Is your app running with `NestDevTools.init(app)`? |
| Firewall prompt | The server binds `localhost` by default |
