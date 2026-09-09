# Security

NestJS DevTools is a development tool that reads sensitive application state — so it is designed privacy-first, by default.

## Redaction engine

Before anything leaves your process, values pass through a deep redactor:

- **Denylist** — a set of key names that are always redacted, with *partial matching*: `userPassword`, `authTokenValue` and `x-api-key` are all caught by `password` / `token` / `apiKey`.
- **Allowlist** — keys you explicitly mark safe (e.g. `allow: ['publicToken']`) are never redacted, even if they match the denylist.
- **String scrubbing** — secrets embedded in free-form text (`password=hunter2`, `Bearer abc.def…`) are replaced with `[REDACTED]`.
- **Circular-safe, depth-capped** — objects are deep-copied (max depth 4), arrays capped at 50 items, and oversized payloads truncated (UTF-8 safe) before serialization.

Default redacted keys:

```
password · token · access_token · accessToken · refresh_token · refreshToken
authorization · cookie · cookies · secret · apiKey · api_key
client_secret · clientSecret · private_key · privateKey · session · set-cookie
```

Redacted values are replaced with `[REDACTED]`.

### Extending

```ts
NestDevTools.init(app, {
  redact: ['cardNumber', 'cvv', 'iban', 'sessionKey'],
  allow: ['publicToken'],   // never redacted, overrides the denylist
});
```

Custom keys participate in partial matching too: `redact: ['iban']` also redacts `primaryIban`.

## HTTP capture

Only a **whitelist of headers** is captured (`content-type`, `user-agent`, `x-forwarded-for`, …). Everything else — including `authorization`, `cookie`, `set-cookie`, `x-api-key` — never leaves the process. Sensitive-looking keys inside the whitelist are redacted anyway.

Query parameters are captured as-is; request and response bodies are **not** transmitted in v0.1 (they are reserved for a future opt-in feature with redaction applied).

## Error payloads

Stack traces contain file paths and code frames — never variable values. The `captureError` helper respects the same redaction rules for context fields.

## Transport

- The SDK connects to `ws://localhost:4318` by default and sends data **outbound only**; no inbound commands are executed.
- Optional token auth: set `NEST_DEVTOOLS_TOKEN` (SDK) and start the server with the same token to require `?token=` on project sockets.
- The server binds `localhost` and stores everything **in memory** — nothing is written to disk.

## Production behavior

By default (`NODE_ENV === 'production'`) the SDK **disables itself**:

- zero patching, sockets or timers — near-zero overhead,
- no configuration or code changes needed,

Force-enabling in production is possible (`enabled: true`) but strongly discouraged: treat the DevTools stream like debug logs, not telemetry.

## Reporting issues

Found a security issue? Please open a private security advisory instead of a public issue.
