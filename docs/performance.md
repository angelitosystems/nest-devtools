# Performance

The Performance view charts your application's runtime health, sampled from the host process every 5 seconds (configurable via `performanceInterval`).

## Metrics

| Metric | Source | Description |
|---|---|---|
| CPU % | `process.cpuUsage()` | Delta between samples, clamped 0–100 |
| Memory (RSS) | `process.memoryUsage()` | Resident set size |
| Heap used / total | V8 heap | Live heap consumption |
| Event-loop lag | `setImmediate` drift | How delayed the loop is — the single best "is my app responsive?" signal |
| Requests/sec | sliding 1s window | Throughput |
| Errors/sec | sliding 1s window | Failure rate |
| Average latency | request durations | Mean of the recent window |
| **p95 / p99** | request durations | Tail latency — what your slowest users feel |

## Charts

Four live sparklines (last ~10 minutes / 120 points):

- **CPU %**
- **Heap used** (MB)
- **Latency p95** (ms)
- **Event-loop lag** (ms)

Plus gauge cards for the current values with threshold coloring: green below 60%, amber up to 80%, red beyond.

## Reading the signals

| Symptom | Likely meaning |
|---|---|
| Event-loop lag climbing with flat CPU | A blocking async operation (big JSON, sync crypto, awaited lock) |
| CPU + lag rising together | Saturated CPU — profile hot paths |
| p95 ≫ average | A few slow endpoints dominate — check the Requests view for outliers |
| Heap sawtooth that never dips | Normal GC. A monotonically rising baseline is a leak — watch heap across deploys |

## Capture controls

```ts
NestDevTools.init(app, {
  capture: { performance: true },   // set false to disable sampling
  performanceInterval: 2000,        // sample every 2s instead of 5s
});
```

Sampling costs microseconds per interval; timers are `unref()`ed so they never keep your process alive.

## Roadmap

GC stats, cluster-aware aggregation and advanced profiling are planned for v1.0 — see the [roadmap](./index.html#roadmap).
