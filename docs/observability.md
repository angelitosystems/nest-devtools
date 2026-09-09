# Observability

What DevTools captures and how to read it in the dashboard.

All views update **in real time** over WebSocket — when a `console.log` fires or a request lands, it appears instantly. The topbar shows the connection state (● Online / Connecting / Offline).

## HTTP Requests

Every request is captured at the Node HTTP server layer, so the full picture is visible regardless of framework internals — including 404s and 5xx.

Captured per request:

| Field | Notes |
|---|---|
| Method / URL | `GET /cats?page=2` |
| Status code | Color-coded (2xx green, 4xx amber, 5xx red) |
| Duration | ms precision |
| Query | Parsed query parameters |
| IP | `X-Forwarded-For` aware |
| User agent | First 200 chars |
| Headers | Whitelisted + redacted (never `authorization`, `cookie`, …) |
| Timeline | Span breakdown (middleware, response) |

Click a request to open the **detail pane**: status, duration, query payload and a timeline bar showing where time went.

### Request correlation

Every request gets an id (`req_…`) propagated via `AsyncLocalStorage`. Logs and errors that happen inside a request carry the same id, so you can answer *"which request produced this log?"* without guesswork.

## Logs

Two sources are intercepted:

- **`console.log/info/warn/error/debug`** — patched transparently; the output still reaches your terminal as usual.
- **NestJS `Logger`** — both `new Logger('Ctx').log(...)` instances and static `Logger.log(...)`, including the Nest bootstrap logs.

Each log entry carries:

```
timestamp · level · message · arguments · context
stack (for errors) · source file:line:column
requestId (when inside a request) · process id
```

The Logs view offers:

- level filters with live counts (ALL / DEBUG / INFO / WARN / ERROR),
- full-text search,
- **Pause/Resume** — freeze the stream to inspect, resume to catch up,
- Clear ( wipes logs on the server for all viewers).

Source locations are rendered as `file.ts:42` next to the message.

## Errors

Three capture paths feed the Error Explorer:

1. `uncaughtException` / `unhandledRejection` process hooks,
2. framework-handled HTTP failures (any request that ends in a 5xx, emitted as `HttpError` with a stable fingerprint),
3. manual reporting from your code:

```ts
import { captureError } from '@angelitosystems/nest-devtools';

try {
  await this.charge(order);
} catch (err) {
  captureError(err, { context: 'billing', controller: 'OrdersController', service: 'BillingService' });
  throw err;
}
```

The explorer **groups identical errors** by fingerprint (name + message + source). For each group you see:

- the error name, message and occurrence count (×14),
- the source location with **Open in VS Code / Cursor** deep links,
- the request (method, URL, status) that triggered it, when applicable,
- recent occurrences with their request ids,
- the full stack trace.

## Performance

Sampled every 5 seconds from the host process:

| Metric | Source |
|---|---|
| CPU % | `process.cpuUsage()` delta |
| Memory (RSS) | `process.memoryUsage()` |
| Heap used / total | V8 heap |
| Event-loop lag | `setImmediate` drift measurement |
| Requests/sec, errors/sec | Sliding 1s windows |
| Average / p95 / p99 latency | Sliding window over completed requests |

Charts render as dependency-free SVG sparklines covering the last ~10 minutes (120 points).

## Multi-project

Every connected app announces a `projectId` + metadata (environment, hostname, pid, Node/Bun version, NestJS version, SDK version). The dashboard's project selector filters requests, logs and errors per app — several projects can stream to one DevTools server at once.
