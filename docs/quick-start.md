# Quick Start

Get from zero to a live debugging dashboard in two minutes.

## 1. Install the SDK

In your NestJS project:

```bash
bun add @angelitosystems/nest-devtools
# npm install @angelitosystems/nest-devtools
# pnpm add @angelitosystems/nest-devtools
```

Works with **Node.js** (18+) and **Bun**, on NestJS 9, 10, 11 and 12.

## 2. Initialize in `main.ts`

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestDevTools } from '@angelitosystems/nest-devtools';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  NestDevTools.init(app);          // ← the only line you add
  await app.listen(3000);
}
bootstrap();
```

> Tip: call `NestDevTools.init(app)` **before** `app.listen()` — but after `listen()` works too.

Prefer not to edit code by hand? Run:

```bash
npx @angelitosystems/nest-devtools-cli init
```

which inserts the import and the `init()` call into your `main.ts` automatically.

## 3. Start the DevTools server

```bash
npx @angelitosystems/nest-devtools-cli
```

Output:

```
NestJS DevTools
──────────────────────────────────────────────
✓ DevTools server started
✓ WebSocket server started
✓ Dashboard available

Dashboard: http://localhost:4317

Waiting for NestJS applications... (Ctrl+C to stop)
```

## 4. Open the dashboard

Visit **http://localhost:4317** and make some requests to your API:

```
┌──────────────────────────────────────────────┐
│ NestJS DevTools                     ● Online │
├──────────────┬───────────────────────────────┤
│ Overview     │ Requests                      │
│ Requests     │ GET /cats             42ms    │
│ Logs         │ POST /cats            81ms    │
│ Errors       │ ...                           │
│ Performance  │ Logs                          │
│ Modules      │ INFO Creating cat Felix       │
│ Providers    │ ...                           │
└──────────────┴───────────────────────────────┘
```

Everything you see updates **in real time** over WebSocket — no polling.

## What happens if the DevTools server is off?

Nothing. Your NestJS app starts and runs completely normally:

- no errors in your terminal,
- no crash, no blocked event loop,
- events are buffered briefly and dropped if the server never appears.

## Try the demo flow

1. Add a log in a service: `this.logger.log('hello')` → appears in **Logs** with `file:line` and the active `requestId`.
2. Throw an error in a controller → appears in **Errors**, grouped by fingerprint.
3. Watch **Performance** chart CPU, heap and latency percentiles every 5 seconds.

## Next steps

- [Configuration](./configuration.md) — options, env vars, sampling
- [Observability](./observability.md) — requests, logs, errors, performance in depth
- [CLI](./cli.md) — `doctor`, `projects`, `logs` and friends
