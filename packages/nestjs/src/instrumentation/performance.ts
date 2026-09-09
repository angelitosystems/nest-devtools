import type { InstrumentationContext } from './http';

/**
 * Performance instrumentation.
 *
 * Periodic CPU/memory/event-loop/latency sampling lives in core
 * (CoreDevtools.startPerformance) so it works even without an HTTP adapter.
 * This module exists as the capture-toggle boundary and future extension
 * point (gc hooks, histograms, cluster awareness).
 */
export class PerformanceInstrumentation {
  constructor(private readonly ctx: InstrumentationContext) {}

  /** No-op: sampling is owned by core. Returns a no-op cleanup. */
  attach(): () => void {
    void this.ctx;
    return () => {};
  }
}
