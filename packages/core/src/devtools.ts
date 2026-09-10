import type { DevToolsEventMap, DevToolsEventName, PerformanceSnapshot, ProjectInfo } from '@angelitosystems/devtools-protocol';
import { LatencyTracker, ProcessMetrics } from './metrics';
import type { DevToolsConfig } from './config';
import { DevToolsTransport } from './transport';
import type { TransportState } from './transport';
import { NodeProfiler, type ProfileKind, type ProfileResult } from './profiling';
import { OpenTelemetryExporter } from './opentelemetry';

export interface CoreDevtoolsOptions {
  config: DevToolsConfig;
  projectInfo: ProjectInfo;
  registerCleanup?: (fn: () => void) => void;
  /** Notified whenever the dashboard connection state changes. */
  onStateChange?: (state: TransportState) => void;
}

/**
 * Shared singleton bridging instrumentation modules and the transport.
 * Owns the project lifecycle and performance sampling.
 */
class CoreDevtools {
  private transport?: DevToolsTransport;
  private config?: DevToolsConfig;
  private projectInfo?: ProjectInfo;
  private perfTimer: ReturnType<typeof setInterval> | null = null;
  private readonly processMetrics = new ProcessMetrics();
  private readonly latency = new LatencyTracker();
  private requestTimestamps: number[] = [];
  private errorTimestamps: number[] = [];
  private lastErrorCount = 0;
  private readonly profiler = new NodeProfiler();
  private telemetry?: OpenTelemetryExporter;

  /** Activate the transport and announce the project. Idempotent. */
  initialize(options: CoreDevtoolsOptions): void {
    if (this.transport) return;
    this.config = options.config;
    this.projectInfo = options.projectInfo;
    if (options.config.openTelemetry?.endpoint) {
      this.telemetry = new OpenTelemetryExporter(options.config.openTelemetry);
    }

    this.transport = new DevToolsTransport(options.config.server, {
      projectId: options.config.projectId,
      token: options.config.token,
      bufferSize: options.config.bufferSize,
      batchMax: options.config.batchMax,
      flushInterval: options.config.flushInterval,
      maxPayloadBytes: options.config.maxPayloadBytes,
      onStateChange: options.onStateChange,
    });
    this.transport.start();
    this.send('project.connected', options.projectInfo);

    if (options.config.capture.performance) {
      this.startPerformance();
    }
    options.registerCleanup?.(() => this.shutdown());
  }

  /** Send a typed event (fire-and-forget, never throws). */
  send<K extends DevToolsEventName>(event: K, payload: DevToolsEventMap[K]): void {
    this.track(event, payload);
    this.telemetry?.record(event, payload);
    try {
      this.transport?.send(event, payload);
    } catch {
      /* never propagate */
    }
  }

  /** Start periodic performance snapshots. */
  startPerformance(intervalMs?: number): void {
    if (this.perfTimer) return;
    const interval = intervalMs ?? this.config?.performanceInterval ?? 5000;
    this.perfTimer = setInterval(() => {
      this.send('performance.updated', this.snapshot());
    }, interval);
    this.perfTimer.unref?.();
  }

  /** Stop periodic performance snapshots. */
  stopPerformance(): void {
    if (this.perfTimer) clearInterval(this.perfTimer);
    this.perfTimer = null;
  }

  /** Start an explicit CPU or heap profile without enabling continuous sampling. */
  async startProfile(kind: ProfileKind): Promise<{ profileId: string; startedAt: number }> {
    const started = await this.profiler.start(kind);
    this.send('profile.started', {
      projectId: this.projectInfo?.projectId ?? 'unknown',
      profileId: started.profileId,
      kind,
      startedAt: started.startedAt,
    });
    return started;
  }

  /** Stop the active profile and publish its result to connected clients. */
  async stopProfile(): Promise<ProfileResult> {
    const result = await this.profiler.stop();
    this.send('profile.completed', {
      projectId: this.projectInfo?.projectId ?? 'unknown',
      profileId: result.profileId,
      kind: result.kind,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      data: result.data,
    });
    return result;
  }

  /** Build a point-in-time performance snapshot. */
  snapshot(): PerformanceSnapshot {
    const memory = this.processMetrics.memory();
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts <= 1000);
    this.errorTimestamps = this.errorTimestamps.filter((ts) => now - ts <= 1000);

    return {
      projectId: this.projectInfo?.projectId ?? 'unknown',
      timestamp: now,
      cpuPercent: this.processMetrics.sampleCpuPercent(),
      memoryUsedBytes: memory.used,
      memoryTotalBytes: memory.total,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      eventLoopLagMs: this.processMetrics.eventLoopLag(),
      activeRequests: 0,
      requestsPerSecond: this.requestTimestamps.length,
      averageLatencyMs: round1(this.latency.average()),
      p95LatencyMs: round1(this.latency.percentile(95)),
      p99LatencyMs: round1(this.latency.percentile(99)),
      errorsPerSecond: this.errorTimestamps.length,
    };
  }

  /** Teardown transport and timers. */
  shutdown(): void {
    this.stopPerformance();
    try {
      this.transport?.stop();
    } catch {
      /* ignore */
    }
    this.telemetry?.stop();
    this.telemetry = undefined;
    this.transport = undefined;
  }

  /** Current connection state (for CLI/doctor output). */
  transportState(): string {
    return this.transport?.getState() ?? 'closed';
  }

  private track(event: DevToolsEventName, payload: unknown): void {
    if (event === 'request.completed') {
      const p = payload as { duration?: number };
      if (typeof p.duration === 'number') {
        this.latency.add(p.duration);
        this.requestTimestamps.push(Date.now());
      }
    } else if (event === 'error.created') {
      this.errorTimestamps.push(Date.now());
      this.lastErrorCount += 1;
    }
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Global core devtools instance. */
export const devtools = new CoreDevtools();