# HTTP Monitoring

Every HTTP request that reaches your NestJS app is captured at the server layer — independently of framework internals — so the picture is complete, including 404s, 401s and 5xx.

## What is captured

| Field | Notes |
|---|---|
| Method | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` |
| URL | Path only (query separated) |
| Status code | Color-coded in the UI |
| Duration | Wall-clock ms, measured at the socket |
| Query | Parsed query parameters |
| IP | `X-Forwarded-For` aware, falls back to socket address |
| User agent | Truncated to 200 chars |
| Headers | Safe whitelist only — see [Security](./security.md) |
| Timeline | Span breakdown (see below) |
| `requestId` | Shared by all logs/errors of this request |

Only the whitelisted headers travel over the wire; `authorization`, `cookie`, `x-api-key` and friends never leave your process. Query values pass through the redaction engine too.

## Requests view

The dashboard's **Requests** page shows a live, searchable table. Filter by URL, method or status — e.g. type `500` to see only failures, or `cats` to filter by route.

Click any row to open the detail pane:

- method, URL, status, duration and start time,
- query parameters as JSON,
- the timeline waterfall.

## Request timeline

Each request carries a list of timed spans rendered as bars relative to total duration:

```
middleware   ████████████████████████████  84ms
response     █ 1ms
```

Deeper instrumentation (guards, interceptors, services, database) plugs into the same span registry — the timeline grows as those collectors land in v0.2/v0.3. Your own code can attach spans today via the request context (see [Plugin API](./plugin-api.md)).

## Request correlation

Every request generates an id (`req_…`) stored in an `AsyncLocalStorage` context. Anything that happens while the request is in flight — logs, errors, and later database queries — is stamped with the same id.

In the dashboard:

- **Logs** entries show `req_…` chips when they belong to a request,
- **Errors** show the triggering request (method + URL + status),
- you can answer "which request produced this log?" without adding a single line of correlation code.

## Errors and 5xx

When a request ends with status ≥ 500, two things happen:

1. a `request.completed` event with `errored: true`,
2. a fingerprinted `error.created` event (`HttpError`) so the failure appears in the [Error Explorer](./errors.md) even though NestJS exception filters handled it silently.

Fingerprints group by method + normalized route + status, so `GET /users/15` and `GET /users/16` group together.

## Capture controls

```ts
NestDevTools.init(app, {
  capture: { requests: true },   // set false to disable entirely
  sampling: 0.5,                 // capture 50% of requests
});
```

Sampling is applied at capture time — unsampled requests cost nothing beyond the initial check.
