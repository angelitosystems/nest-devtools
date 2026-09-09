# Database

> **Status: shipping in v0.3.** The capture toggle (`capture.database`) and protocol event (`query.executed`) already exist; the provider collectors below land next. This page documents the design so you can plan integrations.

## Goal

Every query executed by your app appears in the dashboard's **Database → Queries** view, correlated to the request that caused it and redacted of any secrets.

## Supported providers (planned)

| Provider | Mechanism |
|---|---|
| **Prisma** | `$extends` query component (recommended) / legacy `$use` |
| **TypeORM** | `DataSource` query listener via a global subscriber |
| **Sequelize | `sequelize.addHook('before/afterFind'...)` etc. |
| **MikroORM** | `EntityManager` event subscriber |

Detection is automatic: if the client is resolvable from the Nest container, its collector attaches on `init()`.

## What each query reports

```text
SELECT * FROM users WHERE id = ?

provider:    prisma | typeorm | sequelize | mikroorm
duration:    12ms
database:    users-db (when resolvable)
parameters:  redacted values
requestId:   req_… (when inside a request)
timestamp:   epoch ms
```

Queries also appear as `database` spans in the [request timeline](./http-monitoring.md#request-timeline), e.g.:

```
Service
 └── UsersService      24ms
Database
 ├── SELECT users       8ms
 ├── SELECT roles       5ms
 └── SELECT permissions 7ms
```

## Privacy

- Query **parameters** pass through the [redaction engine](./security.md) — `password`, `token`, etc. become `[REDACTED]`.
- Connection strings are never reported; only a logical database name.
- Raw driver payloads are never transmitted — only the normalized event.

## Enabling / disabling

```ts
NestDevTools.init(app, {
  capture: { database: false },   // opt out entirely
});
```

## Extension point

Custom ORMs can report through the same event — see the [Plugin API](./plugin-api.md). Emit a typed `query.executed` message and the dashboard renders it with zero UI changes.
