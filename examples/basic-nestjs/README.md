# basic-nestjs example

Demonstrates the full MVP loop:

```bash
# terminal 1 — DevTools server + dashboard
cd packages/cli && bun run dev

# terminal 2 — the example app
cd examples/basic-nestjs && bun install && bun run dev

# terminal 2 (or another one) — generate traffic
bun run src/cats.e2e-scenario.ts
```

Then open **http://localhost:4317** and watch requests, logs and errors appear in real time.

- `GET /cats` → logs + fast requests
- `GET /cats/999` → 500 + grouped error with source location
- `POST /cats` with a secret body → demonstrates automatic redaction
