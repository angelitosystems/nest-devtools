# Errors

The Error Explorer turns unhandled and framework-handled failures into a grouped, searchable view with source locations.

## Capture paths

1. **Process hooks** — `uncaughtException` and `unhandledRejection` land here automatically.
2. **Framework-handled HTTP failures** — NestJS exception filters convert controller exceptions into 5xx responses without any process-level signal. DevTools synthesizes a fingerprinted `HttpError` event whenever a request completes with status ≥ 500, so nothing slips through.
3. **Manual reporting** — for errors you catch and handle yourself:

```ts
import { captureError } from '@angelitosystems/nest-devtools';

try {
  await this.charge(order);
} catch (err) {
  captureError(err, {
    context: 'billing',
    controller: 'OrdersController',
    service: 'BillingService',
  });
  throw err; // still handle it your way
}
```

## Grouping

Identical errors share a **fingerprint** (name + message + source file/line). The explorer shows one entry per fingerprint with:

- error name and message (`TypeError: Cannot read properties of undefined`),
- **occurrence count** (×14),
- last-seen time,
- the source location `users.service.ts:87:21`,
- the triggering request (method, URL, status), when it happened inside one.

## Error detail

Selecting a group opens:

- the **stack trace** (whitespace-preserved),
- an **Open in VS Code / Cursor** deep link when the absolute path is known — see [VS Code](./vscode.md) and [Cursor](./cursor.md),
- the request summary,
- **recent occurrences** with timestamps and request ids — click through to the [Requests](./http-monitoring.md) view to see the full context of any occurrence.

## HTTP error fingerprints

Framework-handled failures normalize numeric path segments before fingerprinting:

```
GET /users/15  → 500   ┐
GET /users/16  → 500   ┘ same fingerprint  (route becomes /users/:id)
```

so a flaky handler produces *one* group instead of one per user id.

## Where errors appear

- The **Errors** page (this explorer),
- the **Overview** error summary (top groups),
- live toasts in the topbar when the stream is open.

## Security

Stack traces contain file paths and code locations — never variable values. Payloads still pass through the [redaction engine](./security.md).
