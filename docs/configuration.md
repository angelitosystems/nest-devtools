# Configuration

Everything is optional — the defaults are designed for local development.

```ts
NestDevTools.init(app, options?);
```

## Options

### `enabled`

```ts
enabled: boolean
```

Master switch. **Default:** `process.env.NODE_ENV !== 'production'`.

When `false`, the SDK does *nothing*: no monkey-patching, no sockets, no timers, no allocation. The application behaves exactly as if the SDK were not installed.

### `server`

```ts
server: string  // default 'ws://localhost:4318'
```

WebSocket endpoint of the DevTools server. The SDK reconnects automatically with exponential backoff if the server is unavailable.

### `project`

```ts
project: string  // default: package.json name or directory name
```

Display name of your app in the dashboard's project selector.

### `environment`

```ts
environment: string  // default NODE_ENV or 'development'
```

### `redact` / `allow`

```ts
redact: string[]  // extra keys to redact
allow: string[]   // keys that must never be redacted
```

See [Security](./security.md).

### `capture`

Toggle individual collectors:

```ts
capture: {
  requests: boolean,     // default true
  logs: boolean,         // default true
  errors: boolean,       // default true
  database: boolean,     // default true (collector lands in v0.3)
  websockets: boolean,   // default true (collector lands in v0.3)
  performance: boolean,  // default true
}
```

### Advanced tuning

| Option | Default | Description |
|---|---|---|
| `sampling` | `1` | Fraction of requests/logs to capture (0..1) |
| `bufferSize` | `5000` | Max events buffered while the server is offline |
| `flushInterval` | `150` ms | How often buffered events are flushed |
| `batchMax` | `50` | Max events queued before an immediate flush |
| `maxPayloadBytes` | `262144` | Drop events whose serialized payload exceeds this |
| `performanceInterval` | `5000` ms | Performance sampling cadence |
| `token` | — | Sent as `?token=` for optional server auth |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEST_DEVTOOLS_ENABLED` | `true` outside production | Master switch (`1/true/yes`) |
| `NEST_DEVTOOLS_URL` | `ws://localhost:4318` | Server endpoint |
| `NEST_DEVTOOLS_PROJECT` | package.json name | Project display name |
| `NEST_DEVTOOLS_PROJECT_ID` | slug of the project name | Stable project identifier |
| `NEST_DEVTOOLS_ENV` | `NODE_ENV` | Environment label |
| `NEST_DEVTOOLS_TOKEN` | — | Auth token |
| `NEST_DEVTOOLS_SAMPLING` | `1` | Sampling rate |

## Examples

### Minimal

```ts
NestDevTools.init(app);
```

### Production-safe by default

```ts
// NODE_ENV=production → disabled, zero overhead
NestDevTools.init(app);
```

Force-enable in production (not recommended):

```ts
NestDevTools.init(app, { enabled: true });
```

### Custom server + extra redaction

```ts
NestDevTools.init(app, {
  server: 'ws://devtools.internal:4318',
  project: 'payments-api',
  redact: ['cardNumber', 'cvv', 'iban'],
});
```

### Minimal footprint

```ts
NestDevTools.init(app, {
  capture: { performance: false },
  sampling: 0.25,          // capture 25% of requests
  bufferSize: 1000,
});
```
