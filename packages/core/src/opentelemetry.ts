import { Redactor } from '@angelitosystems/devtools-protocol';
import type { DevToolsEventName } from '@angelitosystems/devtools-protocol';

export interface OpenTelemetryOptions {
  enabled?: boolean;
  endpoint: string;
  serviceName?: string;
  headers?: Record<string, string>;
  maxBatchSize?: number;
  flushIntervalMs?: number;
}

/** Minimal OTLP/HTTP logs exporter with no mandatory OpenTelemetry dependency. */
export class OpenTelemetryExporter {
  private readonly queue: Array<{ event: DevToolsEventName; payload: unknown; timestamp: number }> = [];
  private readonly redactor = new Redactor();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly options: OpenTelemetryOptions) {
    this.schedule();
  }

  record(event: DevToolsEventName, payload: unknown): void {
    if (this.stopped || this.options.enabled === false) return;
    this.queue.push({ event, payload: this.redactor.redact(payload), timestamp: Date.now() });
    if (this.queue.length >= (this.options.maxBatchSize ?? 50)) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.stopped || typeof fetch !== 'function') return;
    const items = this.queue.splice(0, this.options.maxBatchSize ?? 50);
    const endpoint = this.options.endpoint.replace(/\/$/, '') + '/v1/logs';
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.options.headers },
        body: JSON.stringify({
          resourceLogs: [{
            resource: { attributes: [{ key: 'service.name', value: { stringValue: this.options.serviceName ?? 'nestjs-devtools' } }] },
            scopeLogs: [{ logRecords: items.map((item) => ({
              timeUnixNano: String(item.timestamp * 1_000_000),
              severityText: 'INFO',
              body: { stringValue: JSON.stringify({ event: item.event, payload: item.payload }) },
              attributes: [{ key: 'devtools.event', value: { stringValue: item.event } }],
            })) }],
          }],
        }),
      });
    } catch {
      /* telemetry must never affect the application */
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    void this.flush();
    this.stopped = true;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.flush();
      this.schedule();
    }, this.options.flushIntervalMs ?? 1000);
    this.timer.unref?.();
  }
}
