# NestJS DevTools Documentation

Real-time debugging, observability and developer tooling for NestJS applications.

## Getting started

| Page | Description |
|---|---|
| [Installation](./installation.md) | Requirements and setup for Node.js / Bun, npm / pnpm / bun |
| [Quick Start](./quick-start.md) | From `bun add` to a live dashboard in under two minutes |
| [Configuration](./configuration.md) | Every option of `NestDevTools.init()` and the env vars |

## Features

| Page | Description |
|---|---|
| [HTTP Monitoring](./http-monitoring.md) | Request capture, timeline, correlation and sampling |
| [Logs](./logs.md) | console.* and NestJS Logger interception, search and filters |
| [Errors](./errors.md) | Error explorer: capture paths, grouping, fingerprints |
| [Performance](./performance.md) | CPU, memory, event loop, latency percentiles and charts |

## Coming next

| Page | Description |
|---|---|
| [Database](./database.md) | Query observability for Prisma, TypeORM, Sequelize, MikroORM (v0.3) |
| [WebSockets](./websockets.md) | Gateway, connections and event flow monitoring (v0.3) |
| [Events, Queues & Cron](./events.md) | EventEmitter, BullMQ and scheduled tasks (v0.3) |

## Editors

| Page | Description |
|---|---|
| [VS Code](./vscode.md) | `vscode://` deep links to the exact line of code |
| [Cursor](./cursor.md) | `cursor://` deep links |

## Operations

| Page | Description |
|---|---|
| [CLI](./cli.md) | The `nest-devtools` command line: start, status, projects, logs, doctor, init |
| [Publishing](./publishing.md) | First manual npm publication and automated releases with GitHub Actions |
| [Security](./security.md) | Redaction engine, denylist/allowlist, production behavior |
| [Troubleshooting](./troubleshooting.md) | Common symptoms and fixes |
| [Architecture](./architecture.md) | Packages, protocol, data flow and design rules |
| [Plugin API](./plugin-api.md) | Emit custom events, build collectors, editor deep links |

## At a glance

```ts
import { NestDevTools } from '@angelitosystems/nest-devtools';

const app = await NestFactory.create(AppModule);
NestDevTools.init(app);
await app.listen(3000);
```

```bash
nest-devtools        # → http://localhost:4317
```

## Support

- Bugs & features: [GitHub Issues](https://github.com/angelitosystems/nest-devtools/issues)
- License: MIT
