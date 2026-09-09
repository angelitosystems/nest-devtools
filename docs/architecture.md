# Architecture

NestJS DevTools is a small ecosystem of focused packages talking a typed protocol.

```
SDK (@angelitosystems/nest-devtools)
 │
 ├── Instrumentation
 │   ├── HTTP          (server wrap / listen patch)
 │   ├── Console       (console.* patch)
 │   ├── Nest Logger   (Logger.prototype + statics)
 │   ├── Errors        (process hooks + HttpError synthesis)
 │   ├── App Explorer  (container graph → app.snapshot)
 │   ├── Performance   (delegates to core sampler)
 │   └── Websockets/DB (v0.3 extension points)
 │
 └── Transport (@angelitosystems/devtools-core)
          │
          ▼
      Protocol (@angelitosystems/devtools-protocol)
          │  typed DevToolsMessage envelopes
          ▼
      Server (@angelitosystems/nest-devtools-cli)
          │  WS hub + in-memory store + dashboard hosting
          ▼
      Dashboard (React + Vite + Tailwind)
```

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `devtools-protocol` | Wire types: `DevToolsMessage`, event map, redaction engine, editor deep links | nothing (zero deps) |
| `devtools-core` | Transport (WS, buffer/batch/backoff), `AsyncLocalStorage` request context, stack parsing, process metrics, config resolution | protocol |
| `nest-devtools` | The SDK: `NestDevTools.init(app)` and every instrumentation module | core, protocol; peers: `@nestjs/*` |
| `nest-devtools-cli` | `nest-devtools` binary, DevTools server (hub + static hosting), launcher helpers | core, protocol, `ws` |
| `devtools-dashboard` | React SPA rendered at `:4317` | protocol |

## Protocol

One envelope shape for everything on the wire:

```ts
interface DevToolsMessage<T> {
  v: 1;                 // protocol version
  id: string;           // message id
  projectId?: string;   // origin project
  ts: number;           // epoch ms
  event: DevToolsEventName;
  payload: T;           // typed per event
}
```

Events (v1): `project.connected` · `project.disconnected` · `request.started` · `request.completed` · `log.created` · `error.created` · `query.executed` (reserved) · `websocket.*` (reserved) · `performance.updated` · `app.snapshot` · control plane (`client.hello`, `state.snapshot`, `state.clear`, `stream.pause/resume`, …).

The full type map lives in [`packages/protocol/src/types.ts`](../packages/protocol/src/types.ts).

## Endpoints

| Endpoint | Purpose |
|---|---|
| `http://localhost:4317` | Dashboard static files (SPA fallback) |
| `http://localhost:4317/health` | Liveness probe for `nest-devtools status` |
| `ws://localhost:4318?projectId=<id>` | SDK project connections |
| `ws://localhost:4317/ws?client=dashboard` | Dashboard/CLI control connections |

## SDK design rules

1. **Never throw** — every instrumentation module wraps its work in try/catch. An SDK bug must never take down an app.
2. **Never block** — all I/O is async; event sends are fire-and-forget; timers are `unref()`ed so the SDK never keeps the process alive.
3. **Graceful degradation** — server offline? Events go to a bounded ring buffer (drop-oldest) and the transport retries with exponential backoff + jitter.
4. **Production-inert** — `enabled: false` (default in production) means no patching, no sockets, no timers.
5. **Redact before send** — the protocol package redacts payloads *before* serialization, so secrets never even reach the transport.

## HTTP instrumentation

The SDK supports both bootstrap orders:

- `init(app)` **after** `app.listen()` → the server exists; its `request` listeners are wrapped directly.
- `init(app)` **before** `app.listen()` (recommended) → `app.listen` is wrapped; the moment the server exists, its listeners are wrapped (idempotently, guarded by a symbol).

Request wrapping re-emits original listeners so Express/Nest behavior is untouched. Failures (5xx) are captured twice: as `request.completed` and as a fingerprinted `error.created` (`HttpError`), since Nest exception filters handle errors without any process-level signal.

## Request context

`AsyncLocalStorage` binds `{ requestId, method, url, startedAt }` around each request. Any log or error captured inside the request inherits the `requestId` — the glue that ties the Logs, Errors and Requests views together.

## Server

The server is a thin hub:

- validates and normalizes frames (protocol parse),
- applies them to per-project ring buffers (requests 1000, logs 5000, errors 1000, queries 2000, perf 240 points),
- fans events out to dashboard clients in real time,
- replays a full `state.snapshot` to newly connected dashboards.

Everything is in-memory; there is no database by design (MVP scope).

## Testing strategy

- **unit** — protocol (redaction, URLs, message parsing), core (config, sampling, transport buffering), SDK helpers,
- **integration** — real WS clients against a live `DevToolsServer` (project connect → event flow → snapshot → clear),
- **E2E smoke** (`bun run e2e`) — boots the real server + the real example NestJS app, generates traffic, asserts events arrive at the server store.

The E2E explicitly exercises: dev server offline (SDK must not crash), 5xx error synthesis, request correlation (`requestId` on logs), and multi-event ordering.
