import type { InstrumentationContext } from './http';
import type { SourceLocation, TimelineSpan } from '@angelitosystems/devtools-protocol';
import { requestContext } from '@angelitosystems/devtools-core';
import { Redactor } from '@angelitosystems/devtools-protocol';
import { emit } from '../emitter';
import { recordSpan } from './timeline';

/** Queue/event instrumentation, best-effort and opt-in. */
export class QueueEventInstrumentation {
  private readonly redactor: Redactor;
  private readonly config: { capture: { requests: boolean; logs: boolean; errors: boolean; database: boolean; websockets: boolean; performance: boolean } };
  private readonly projectId: string;

  constructor(ctx: InstrumentationContext) {
    this.config = ctx.config as any;
    this.projectId = ctx.projectInfo.projectId;
    this.redactor = new Redactor({
      redact: ctx.config.redact,
      allow: ctx.config.allow,
      maxBytes: ctx.config.maxPayloadBytes,
    });
  }

  /** Attach queue hooks if a supported client is detected. Returns cleanup. */
  attach(): () => void {
    const cleanup: Array<() => void> = [];
    if (!this.config.capture.requests && !this.config.capture.logs && !this.config.capture.errors) {
      return () => cleanup.forEach((fn) => fn());
    }

    if (this.tryAttachBull()) cleanup.push(this.detachBull());
    return () => cleanup.forEach((fn) => fn());
  }

  /** Register a queue span correlated with the active request, if any. */
  static recordJobSpan(
    queueName: string,
    jobId: string,
    label: string,
    options?: { source?: SourceLocation; status?: 'ok' | 'error' },
  ): void {
    const requestId = requestContext().requestId() ?? randomId('queue');
    recordSpan(requestId, 'queue', `${queueName}:${label} (${jobId})`, {
      detail: `queue=${queueName} job=${jobId}`,
      source: options?.source,
      status: options?.status,
    } as any);
  }

  /** Emit a log for queue events, correlated with the active request if any. */
  static emitJobLog(
    queueName: string,
    jobId: string,
    level: 'debug' | 'info' | 'warn' | 'error' | 'verbose',
    message: string,
    options?: { source?: SourceLocation },
  ): void {
    const requestId = requestContext().requestId();
    emit('log.created', {
      requestId,
      projectId: options?.source ? undefined : undefined,
      level,
      message: `[${queueName}] ${message} (${jobId})`,
      source: options?.source,
      context: queueName,
      processId: process.pid,
      requestId,
      timestamp: Date.now(),
    } as any);
  }

  private tryAttachBull(): boolean {
    try {
      const app = this.getApp();
      if (!app) return false;
      const bull = this.resolveBull(app);
      if (!bull) return false;

      const origProcess = bull.prototype?.process ?? bull.process;
      if (typeof origProcess === 'function') {
        const wrapped = this.wrapProcess(origProcess, bull);
        if (bull.prototype) bull.prototype.process = wrapped;
        bull.process = wrapped;
      }

      return true;
    } catch {
      return false;
    }
  }

  private detachBull(): () => void {
    return () => {
      try {
        const app = this.getApp();
        if (!app) return;
        const bull = this.resolveBull(app);
        if (!bull) return;
        // Not safe to restore reliably; best-effort no-op.
      } catch {}
    };
  }

  private wrapProcess(original: Function, bull: any): Function {
    return async function (this: any, ...args: any[]) {
      const handler = args[0];
      if (!handler || typeof handler !== 'function') return original.apply(this, args);

      const wrapped = async (...handlerArgs: any[]) => {
        const job = handlerArgs[0];
        if (!job || typeof job !== 'object') return handler.apply(this, handlerArgs);

        const jobId = job.id ?? job.data?.jobId ?? randomId('job');
        const queueName = job.queueName ?? this.estimateQueueName(bull);
        const started = Date.now();

        QueueEventInstrumentation.recordJobSpan(queueName, jobId, 'process', { status: 'ok' });
        try {
          const result = await Promise.resolve(handler.apply(this, handlerArgs));
          QueueEventInstrumentation.recordJobSpan(queueName, jobId, 'process', {
            status: 'ok',
          });
          QueueEventInstrumentation.emitJobLog(queueName, jobId, 'info', 'job completed', {
            source: resolveSourceLocation(new Error(), { skip: 2 }),
          });
          return result;
        } catch (err) {
          QueueEventInstrumentation.recordJobSpan(queueName, jobId, 'process', {
            status: 'error',
          });
          QueueEventInstrumentation.emitJobLog(queueName, jobId, 'error', String(err), {
            source: resolveSourceLocation(err instanceof Error ? err : new Error(), { skip: 2 }),
          });
          throw err;
        }
      };

      return original.apply(this, [wrapped, ...args.slice(1)]);
    };
  }

  private estimateQueueName(bull: any): string {
    try {
      if (bull.name) return bull.name;
      if (typeof bull === 'function') return bull.name;
      return 'queue';
    } catch {
      return 'queue';
    }
  }

  private resolveBull(app: any): any {
    try {
      const bull = app.get('BullService') ?? app.get('Bull') ?? app.get('bull') ?? app.get('Queue') ?? null;
      if (bull && (typeof bull.process === 'function' || typeof bull.prototype?.process === 'function')) return bull;
      return null;
    } catch {
      return null;
    }
  }

  private getApp(): any {
    try {
      const ctx = this.ctx as any;
      if (ctx.getHttpAdapter) return ctx;
      if (ctx.app) return ctx.app;
      return null;
    } catch {
      return null;
    }
  }
}

function randomId(prefix: string): string {
  const core =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  return prefix ? `${prefix}_${core}` : core;
}
