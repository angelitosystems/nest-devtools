# Plugin API

> **Status: the building blocks exist today; the formal plugin surface stabilizes in v1.0.** This page documents what you can build **now** and the shape it's heading toward.

## What you can build today

### 1. Emit custom events through the protocol

The protocol package is public and dependency-free. Any Node/Bun process can speak it:

```ts
import { createMessage } from '@angelitosystems/devtools-protocol';
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:4318?projectId=my-integration');

ws.on('open', () => {
  ws.send(JSON.stringify(
    createMessage('log.created', {
      projectId: 'my-integration',
      level: 'info',
      message: 'Custom collector connected',
      processId: process.pid,
      timestamp: Date.now(),
    }),
  ));
});
```

The server validates the frame, stores it in the project's buffers and forwards it to every dashboard — appearing in the Logs view like any native event.

### 2. Build a custom collector

Anything that produces structured events can feed DevTools. The recipe used by the built-in collectors:

```ts
// 1. capture (patch/hook/listen — always best-effort, never throw)
// 2. redact            (protocol's Redactor)
// 3. correlate         (core's requestContext().requestId())
// 4. emit              (fire-and-forget over the transport)
```

Available building blocks from `@angelitosystems/devtools-core` / `devtools-protocol`:

| Export | Purpose |
|---|---|
| `Redactor` | Deep redaction, string scrubbing, size caps |
| `requestContext()` | `AsyncLocalStorage` request correlation |
| `resolveSourceLocation()` | Stack → `{ file, line, column }` |
| `LatencyTracker` | Sliding-window avg/p95/p99 |
| `DevToolsTransport` | Resilient WS transport (buffer/batch/backoff) |
| `createMessage()` | Typed protocol envelopes |

### 3. Report custom errors

From any code path:

```ts
import { captureError } from '@angelitosystems/nest-devtools';

captureError(new Error('Rate limiter tripped'), { context: 'throttler' });
```

### 4. Deep-link into editors

Generate the same links the dashboard uses:

```ts
import { vscodeUrl, cursorUrl } from '@angelitosystems/devtools-protocol';

vscodeUrl({ absolutePath: '/api/src/users.service.ts', line: 87, column: 21 });
// 'vscode://file/api/src/users.service.ts:87:21'
cursorUrl({ absolutePath: '/api/src/users.service.ts', line: 87 });
// 'cursor://file/api/src/users.service.ts:87:1'
```

## Coming in v1.0: formal plugins

The stabilized surface will let packages register collectors without touching internals:

```ts
// sketch — not yet implemented
NestDevTools.init(app, {
  plugins: [
    myPrismaCollector(),     // hooks lifecycle: init, attach, dispose
    kafkaCollector({ topics: ['orders'] }),
  ],
});
```

A plugin will implement:

```ts
interface DevToolsPlugin {
  name: string;
  onInit(ctx: PluginContext): void | Promise<void>;  // config + transport access
  onAttach(app: INestApplication): void;             // hook the app
  onDispose?(): void;                                // restore everything
}
```

Rules that will not change:

- plugins are **sandboxed by contract** — thrown errors are contained and logged, never propagated to the app,
- everything a plugin emits passes the same redaction pipeline,
- the wire format stays the typed protocol (custom events use reserved `custom.*` namespaces planned for v1.0).
