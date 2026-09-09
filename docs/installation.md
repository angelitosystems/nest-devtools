# Installation

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ (20/22 recommended) **or** Bun 1.1+ |
| NestJS | 9, 10 or 11 (`@nestjs/core` + `@nestjs/common`) |
| `reflect-metadata` | already required by NestJS |

## 1. Install the SDK

In your NestJS application:

```bash
bun add @angelitosystems/nest-devtools
```

```bash
npm install @angelitosystems/nest-devtools
```

```bash
pnpm add @angelitosystems/nest-devtools
```

The SDK ships with zero runtime dependencies of its own beyond the DevTools core/protocol packages, which are bundled in the published artifact.

## 2. Install the CLI (dashboard + server)

You only need this on your development machine — not on every project:

```bash
npx @angelitosystems/nest-devtools-cli          # one-off
bun add -g @angelitosystems/nest-devtools-cli   # global
npm install -g @angelitosystems/nest-devtools-cli
```

## 3. Wire it up

```ts
// src/main.ts
import { NestDevTools } from '@angelitosystems/nest-devtools';

const app = await NestFactory.create(AppModule);
NestDevTools.init(app);
await app.listen(3000);
```

Prefer automation? Run `nest-devtools init` inside your project and it will edit `main.ts` for you — see the [CLI](./cli.md) page.

## 4. Verify

```bash
nest-devtools          # start the server
nest-devtools doctor   # or diagnose an existing setup
```

Open <http://localhost:4317> — the topbar should show **● Online** once your app boots and connects.

## Monorepo users

Nothing special is required. Install the SDK in each *application* package (the one that calls `NestFactory.create`). Workspace hoisting works with pnpm, Yarn, npm and Bun workspaces.

## Troubleshooting install issues

See the [Troubleshooting](./troubleshooting.md) page. The most common cause of a silent SDK is `NODE_ENV=production` (the SDK disables itself by default).
