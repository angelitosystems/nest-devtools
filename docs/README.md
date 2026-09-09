# NestJS DevTools Documentation

Real-time debugging, observability and developer tooling for NestJS applications.

## Getting started

| Page | Description |
|---|---|
| [Quick Start](./quick-start.md) | From `bun add` to a live dashboard in under two minutes |
| [Configuration](./configuration.md) | Every option of `NestDevTools.init()` and the env vars |

## Features

| Page | Description |
|---|---|
| [Observability](./observability.md) | HTTP requests, logs, error explorer, performance metrics |

## Operations

| Page | Description |
|---|---|
| [CLI](./cli.md) | The `nest-devtools` command line: start, status, projects, logs, doctor, init |
| [Security](./security.md) | Redaction engine, denylist/allowlist, production behavior |
| [Architecture](./architecture.md) | Packages, protocol, data flow and design rules |

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
