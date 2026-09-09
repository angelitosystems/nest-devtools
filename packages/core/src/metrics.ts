import { cpuUsage, memoryUsage } from 'process';

/** Latency tracker that computes avg/p95/p99 over a sliding window. */
export class LatencyTracker {
  private readonly samples: number[] = [];

  add(durationMs: number): void {
    this.samples.push(durationMs);
    if (this.samples.length > 1000) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  average(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index] ?? 0;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/** Process-level metrics collector (CPU, memory, heap, event-loop lag). */
export class ProcessMetrics {
  private lastCpu = cpuUsage();
  private lastTs = Date.now();
  private lagMs = 0;

  constructor() {
    this.measureLag();
  }

  /** Sample one CPU window; call periodically. */
  sampleCpuPercent(): number {
    const now = Date.now();
    const delta = now - this.lastTs;
    if (delta <= 0) return 0;
    const usage = cpuUsage(this.lastCpu);
    this.lastCpu = cpuUsage();
    this.lastTs = now;
    const percent = ((usage.user + usage.system) / 1000 / delta) * 100;
    return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
  }

  /** Memory snapshot in bytes. */
  memory(): { used: number; total: number; heapUsed: number; heapTotal: number } {
    const mem = memoryUsage();
    return {
      used: mem.rss,
      total: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    };
  }

  /** Most recent event-loop lag measurement in ms. */
  eventLoopLag(): number {
    return this.lagMs;
  }

  private measureLag(): void {
    const start = performance.now();
    setImmediate(() => {
      this.lagMs = Math.round((performance.now() - start) * 100) / 100;
      // keep measuring quietly; timer is unref'd by callers owning lifecycle
      setTimeout(() => this.measureLag(), 1000).unref?.();
    });
  }
}
