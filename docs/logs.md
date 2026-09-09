# Logs

NestJS DevTools intercepts every log your application produces and streams it to the dashboard in real time — with the exact source location and request correlation.

## Sources

### console.*

```
console.log() · console.info() · console.warn() · console.error() · console.debug()
```

Arguments are redacted and serialized safely (circular structures, BigInts and functions included). The output still reaches your terminal exactly as before — DevTools only mirrors it.

### NestJS Logger

```
new Logger('UsersService').log('User created');   // instance
Logger.log('Bootstrapping', 'Bootstrap');          // static
```

Both forms are captured, including the NestJS bootstrap logs, with the logger's context (`[UsersService]`) preserved.

## Every log carries

| Field | Description |
|---|---|
| `timestamp` | Milliseconds since epoch |
| `level` | `debug · info · warn · error · verbose` |
| `message` | Redacted, formatted message |
| `arguments` | The original arguments, redacted |
| `source` | `file:line:column` of the call site |
| `stack` | Stack trace (for `error` level) |
| `requestId` | Present when logged inside an HTTP request |
| `context` | NestJS logger context, if any |
| `processId` | PID of the emitting process |

## The Logs view

- **Level filters** — ALL / DEBUG / INFO / WARN / ERROR with live counts.
- **Search** — full-text over the message.
- **Pause / Resume** — freeze the stream to inspect a moment in time; resume to catch up. New logs keep buffering server-side while paused.
- **Clear** — wipes the log buffer on the server for all viewers.
- **Source locations** — rendered as `users.service.ts:42` next to the message.

## Search and filter examples

| Goal | Action |
|---|---|
| Only errors | Click `ERROR` filter |
| Logs mentioning "cache" | Type `cache` in the search box |
| Logs of one request | Note the `requestId` from a request detail, search for it |
| Freeze traffic to read | Click **Pause**, then **Resume** |

## Security

Log arguments pass through the [redaction engine](./security.md): `password`, `token`, `authorization`, `apiKey`, `cookie`, `secret` and partial matches are replaced with `[REDACTED]` — including secrets embedded in free-form strings (`password=hunter2`).

## Roadmap

Planned improvements: log bookmarks, jump-to-source from the UI (v0.4 editor integration), and retention controls.
