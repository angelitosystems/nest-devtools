<p align="center">
  <img alt="NestJS DevTools" src="https://img.shields.io/badge/NestJS-DevTools-e0234e?logo=nestjs&logoColor=white" />
  <img alt="npm" src="https://img.shields.io/badge/npm-@angelitosystems%2Fnest--devtools-cb3837?logo=npm" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
</p>

<h1 align="center">NestJS DevTools</h1>

<p align="center">
  <b>Real-time debugging, observability and developer tooling for NestJS.</b><br/>
  One package, one line of code, and a live dashboard at <code>http://localhost:4317</code>.
</p>

---

## Why

`console.log` debugging in NestJS loses context: which request triggered it, which guard ran, where the error came from. NestJS DevTools instruments your app **transparently** and streams everything — requests, logs, errors, performance — into a local, real-time dashboard.

```
NestJS Application
       │
       ▼
NestDevTools SDK          (one line in main.ts)
       │  WebSocket
       ▼
DevTools Server           (nest-devtools start)
       │
       ▼
Dashboard                 (http://localhost:4317)
```

If the DevTools server is **not running, your app runs normally** — no crashes, no errors, no blocking. Ever.

## Quick Start

**1. Install the SDK in your NestJS app**

```bash
bun add @angelitosystems/nest-devtools
# or: npm install / pnpm add / yarn add
```

**2. Add one line to `main.ts`**

```ts
import { NestDevTools } from '@angelitosystems/nest-devtools';

const app = await NestFactory.create(AppModule);
NestDevTools.init(app);          // ← that's it
await app.listen(3000);
```

**3. Start the DevTools server**

```bash
npx @angelitosystems/nest-devtools-cli
# or install globally:  bun add -g @angelitosystems/nest-devtools-cli
```

```
NestJS DevTools
──────────────────────────────────────────────
✓ DevTools server started
✓ WebSocket server started
✓ Dashboard available

Dashboard: http://localhost:4317

Waiting for NestJS applications... (Ctrl+C to stop)
```

**4. Open the dashboard and hit your API** — requests, logs and errors appear instantly.

## What you get (MVP, v0.1)

| Feature | Description |
|---|---|
| **Requests** | Every HTTP request: method, URL, status, duration, query, IP, user-agent — streamed live |
| **Logs** | `console.*` **and** NestJS `Logger` output, with source file, line and `requestId` correlation |
| **Errors** | Error explorer with stack traces, source locations and grouping of repeated errors |
| **Performance** | CPU, memory, heap, event-loop lag, req/s, avg/p95/p99 latency — updated every few seconds |
| **Application** | Module graph: controllers, providers, guards, interceptors and pipes of the running app |
| **Multi-project** | Several NestJS apps can stream to one DevTools server; switch between them in the UI |
| **Security** | Automatic redaction of `password`, `token`, `authorization`, `apiKey`, `cookie` and friends |

### Request correlation

Every event that happens inside a request shares a `requestId` (powered by `AsyncLocalStorage`):

```
GET /cats/999  → 500
  ├─ log:   "Fetching cat 999"          (requestId: req_ac0f…)
  ├─ error: Cat #999 not found          (requestId: req_ac0f…)
  └─ http:  GET /cats/999 → 500         (requestId: req_ac0f…)
```

### Source locations

Logs and errors carry the exact file, line and column (`users.service.ts:87:21`), with deep links to open them in **VS Code** (`vscode://file/...`) or **Cursor** (`cursor://file/...`).

## Packages

| Package | Purpose |
|---|---|
| [`@angelitosystems/nest-devtools`](packages/nestjs) | The SDK you install in your NestJS app |
| [`@angelitosystems/nest-devtools-cli`](packages/cli) | `nest-devtools` CLI: local server + dashboard |
| [`@angelitosystems/devtools-core`](packages/core) | Transport, request context, source maps, metrics |
| [`@angelitosystems/devtools-protocol`](packages/protocol) | Typed WebSocket protocol shared by all tiers |

## Configuration

`NestDevTools.init(app, options)` — everything is optional:

```ts
NestDevTools.init(app, {
  enabled: true,                       // default: NODE_ENV !== 'production'
  server: 'ws://localhost:4318',       // DevTools server endpoint
  project: 'my-api',                   // display name
  environment: 'development',

  redact: ['mySecretField'],           // extra keys to redact
  allow: ['publicToken'],              // keys that must never be redacted

  capture: {
    requests: true,
    logs: true,
    errors: true,
    database: true,                    // wired for v0.3
    websockets: true,                  // wired for v0.3
    performance: true,
  },
});
```

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `NEST_DEVTOOLS_ENABLED` | `true` outside production | Master switch |
| `NEST_DEVTOOLS_URL` | `ws://localhost:4318` | Server endpoint |
| `NEST_DEVTOOLS_PROJECT` | package.json name | Project display name |
| `NEST_DEVTOOLS_TOKEN` | — | Optional auth token |

**In production the SDK disables itself** and adds near-zero overhead: no patching, no sockets, no timers.

## CLI

```
nest-devtools              Start the server + dashboard (default)
nest-devtools start        Same, with --port / --ws-port / --host options
nest-devtools status       Is the server running?
nest-devtools projects     List known projects
nest-devtools logs         Stream recent logs
nest-devtools doctor       Diagnose your environment
nest-devtools init         Add NestDevTools.init(app) to your main.ts
nest-devtools --version
```

## Dashboard

- **Overview** — live stat cards and streaming feeds
- **Requests** — searchable table; click one for its timeline breakdown
- **Logs** — level filters (ALL/DEBUG/INFO/WARN/ERROR), full-text search, pause/resume
- **Errors** — grouped by fingerprint with occurrence counts, stack traces and editor deep links
- **Performance** — live CPU/heap/event-loop charts and latency percentiles
- **Application** — browse modules, controllers and providers of the connected app

## Architecture

```
packages/
├── protocol/   Typed DevToolsMessage envelope, events, redaction, editor URLs
├── core/       WebSocket transport (buffer/batch/backoff), AsyncLocalStorage
│               request context, source locations, process metrics
├── nestjs/     SDK: NestDevTools.init() + HTTP/console/logger/error/explorer hooks
└── cli/        nest-devtools CLI, DevTools server (WS hub + dashboard hosting)

apps/dashboard  React + Vite + Tailwind: the real-time UI
examples/       Runnable sample apps
docs/           Documentation
```

Design rules: the SDK **never throws**, **never blocks** the event loop, **never crashes** the host app, and communicates over a fully typed protocol. See [docs/architecture.md](docs/architecture.md).

## Development (this monorepo)

```bash
bun install
bun run build          # build all packages
bun test               # run all tests
bun run e2e            # end-to-end smoke: server + example app + traffic

# run the full stack locally:
bun run dev:server     # DevTools server + dashboard  → http://localhost:4317
bun run dev:example    # example NestJS app          → http://localhost:3001
bun run dev:dashboard  # dashboard with HMR          → http://localhost:5173
```

## Roadmap

- **v0.1** — SDK, WebSocket, logs, HTTP, errors, dashboard ✅
- **v0.2** — NestJS explorer, performance, request timeline, source locations
- **v0.3** — Database (Prisma/TypeORM/Sequelize/MikroORM), WebSockets, events, queues
- **v0.4** — VS Code extension, Cursor integration, command palette
- **v1.0** — Stable protocol, plugin system, advanced profiling, OpenTelemetry, teams

## Security

Designed privacy-first: secrets are redacted **before** anything leaves your process, with a denylist, allowlist and free-text scrubbing. Read more in [docs/security.md](docs/security.md).

## License

[MIT](LICENSE) © Angelito Systems
