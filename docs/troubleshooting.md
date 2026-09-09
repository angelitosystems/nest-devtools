# Troubleshooting

## The app doesn't appear in the dashboard

| Check | How |
|---|---|
| Is the server running? | `nest-devtools status` or open `http://localhost:4317/health` |
| Is the SDK initialized? | `NestDevTools.init(app)` present **and executed** in `main.ts` |
| Is it disabled by env? | `NEST_DEVTOOLS_ENABLED=false` or `NODE_ENV=production` disables the SDK by design |
| Wrong endpoint? | `NEST_DEVTOOLS_URL` must match the server's WS port (default `ws://localhost:4318`) |
| Firewall/antivirus? | The SDK connects **outbound** to localhost; corporate proxies can block `ws://` |

Run `nest-devtools doctor` from your project root to check all of the above at once.

## "My app crashed after adding the SDK"

That should never happen — the SDK is designed to fail silently:

1. Try `NEST_DEVTOOLS_ENABLED=false` — if the crash disappears, it's DevTools; please [open an issue](https://github.com/angelitosystems/nest-devtools/issues) with the stack trace.
2. Known interactions to check: other libraries that also patch `console.*` or `http.createServer`.

## Nothing appears (server runs, app connects)

- **Requests but no logs** — a log level filter is active, or you paused the stream (topbar / Logs page).
- **Logs but no requests** — the app connected before `listen()` and the HTTP adapter wasn't detected; make sure `init(app)` is called on the Nest app instance.
- **Everything stale** — the dashboard shows the server's buffered history; hit **Clear** in the topbar.

## Errors: "no source" or wrong file:line

| Setup | Result |
|---|---|
| Bun / ts-node / tsx | Exact locations |
| `dist/` + source maps | Exact (resolves to `src/`) |
| `dist/` without source maps | `dist/*.js` locations only |

Enable `"sourceMap": true` in `tsconfig.json`. Framework-handled HTTP failures (5xx) are synthesized events and report the route rather than a stack — see [Errors](./errors.md).

## Port conflicts

```
Error: listen EADDRINUSE :::4317
```

```bash
# option 1: move the server
nest-devtools start --port 4319 --ws-port 4320
# option 2: point your app at the new port
NEST_DEVTOOLS_URL=ws://localhost:4320
```

To find the stale process: `netstat -ano | findstr 4317` (Windows) or `lsof -i :4317` (macOS/Linux).

## High log volume slows the dashboard

The server keeps ring buffers (5000 logs / 1000 requests / 1000 errors per project) and the SDK drops — never queues unbounded — when the server is offline. For noisy apps:

```ts
NestDevTools.init(app, {
  sampling: 0.25,              // capture 25% of requests/logs
  bufferSize: 1000,
  maxPayloadBytes: 64 * 1024,  // drop huge payloads
});
```

## Bun-specific notes

- Bun resolves the SDK fine via workspaces and node_modules.
- `bun test` runs the SDK's own suite (`bun test packages` in this repo).

## Still stuck?

1. Collect `nest-devtools doctor` output,
2. Note your Node/Bun version and how you start the app,
3. [Open an issue](https://github.com/angelitosystems/nest-devtools/issues) with the details.
