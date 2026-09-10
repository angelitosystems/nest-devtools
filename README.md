# NestJS DevTools – Updated Architecture (Embedded Mode)

## What changed

**Before**
```bash
# Terminal 1
nest-devtools start

# Terminal 2
npm run start:dev
```

**After (new way)**
```bash
# Only one command
npm run start:dev
```

The DevTools server + WebSocket + Dashboard now start **automatically** inside the same process when you call `NestDevTools.init(app)`.

---

## Files you need

### 1. SDK (what the NestJS app imports)

| File | Purpose |
|------|---------|
| `packages/sdk/src/init.ts` | Main entry – starts the embedded server |
| `packages/sdk/src/index.ts` | Public exports |
| `packages/sdk/src/nest-devtools.ts` | Convenience namespace `NestDevTools.init()` |
| `packages/sdk/src/sdk-connection.ts` | Internal connection logic (same process) |

### 2. Server (embedded dashboard + websocket)

| File | Purpose |
|------|---------|
| `packages/server/src/server.ts` | HTTP + WebSocket server that runs inside the Nest process |

### 3. Example usage

| File | Purpose |
|------|---------|
| `examples/basic-nestjs/src/main.ts` | How the user should use it |

---

## How to integrate in your real project

1. Copy the `packages/sdk` and `packages/server` folders into your monorepo (or adapt the paths).
2. Make sure the dashboard static files are built into `packages/server/dashboard`.
3. In your NestJS `main.ts`:

```ts
import { NestDevTools } from '@nests-devtools/sdk'; // or relative path

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await NestDevTools.init(app);   // ← only this line

  await app.listen(3000);
}
```

4. Remove any separate `nest-devtools start` scripts from your workflow.

---

## Optional configuration

```ts
await NestDevTools.init(app, {
  port: 4317,              // dashboard
  wsPort: 4318,            // websocket
  openDashboard: true,     // open browser automatically
  enabled: true,           // force enable even in production (not recommended)
  host: 'localhost',
});
```

You can also control it with environment variables:

```bash
NEST_DEVTOOLS_PORT=4317
NEST_DEVTOOLS_WS_PORT=4318
NEST_DEVTOOLS_OPEN=true
```

---

## Benefits of the new architecture

- ✅ One single process
- ✅ No race conditions
- ✅ Dashboard dies automatically when the Nest app stops
- ✅ Much better Developer Experience
- ✅ Fallback: if the port is already taken it connects as client

---

## Next steps you can do

1. Move your real dashboard UI into `packages/server/dashboard`
2. Expand the WebSocket protocol in `server.ts` and `sdk-connection.ts`
3. Add request/response interception, graph introspection, logs, etc.
4. Publish the SDK as an npm package if you want

If you share the original source structure I can adapt these files 100% to your current code.
