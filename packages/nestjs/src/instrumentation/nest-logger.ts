import { Logger } from '@nestjs/common';
import { Redactor } from '@angelitosystems/devtools-protocol';
import type { LogPayload, LogLevel, ProjectInfo } from '@angelitosystems/devtools-protocol';
import { requestContext, resolveSourceLocation } from '@angelitosystems/devtools-core';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';

import { emit } from '../emitter';

/**
 * Captures NestJS framework logs (`new Logger('Ctx').log(...)` and the static
 * `Logger.log(...)` variants). Nest's Logger writes through process.stdout
 * internals, not console.*, so it needs its own hook.
 *
 * State is module-scoped on purpose: the patched methods are plain functions
 * and must never depend on class-instance `this` binding.
 */
let activeRedactor = new Redactor();
let activeConfig: DevToolsConfig | null = null;
let activeProjectId = '';

function capture(level: LogLevel, message: unknown, context?: string, stack?: string): void {
  try {
    if (!activeConfig?.capture.logs) return;
    const text = typeof message === 'string' ? message : activeRedactor.serialize(message);
    const payload: LogPayload = {
      projectId: activeProjectId,
      level,
      message: activeRedactor.redactString(text),
      source: stack ? undefined : resolveSdkAwareLocation(),
      context,
      stack,
      processId: process.pid,
      requestId: requestContext().requestId(),
      timestamp: Date.now(),
    };
    emit('log.created', payload);
  } catch {
    /* never propagate */
  }
}

/** Captures NestJS Logger output and mirrors it to DevTools. */
export class LoggerInstrumentation {
  constructor(ctx: { config: DevToolsConfig; projectInfo: ProjectInfo }) {
    activeRedactor = new Redactor({
      redact: ctx.config.redact,
      allow: ctx.config.allow,
      maxBytes: ctx.config.maxPayloadBytes,
    });
    activeConfig = ctx.config;
    activeProjectId = ctx.projectInfo.projectId;
  }

  /** Patch Logger.prototype and the static Logger methods. Returns a restore function. */
  attach(): () => void {
    const restores: Array<() => void> = [];

    const patch = (owner: Record<string, unknown>, method: string, level: LogLevel, instance: boolean) => {
      const original = owner[method];
      if (typeof original !== 'function') return;

      owner[method] = function (this: unknown, message: unknown, ...rest: unknown[]) {
        const context = instance
          ? ((this as { context?: string } | undefined)?.context ?? (rest[0] as string | undefined))
          : (rest[0] as string | undefined);
        const stack = rest[1] as string | undefined;
        try {
          const result = (original as (...a: unknown[]) => unknown).apply(this, [message, ...rest]);
          capture(level, message, context, stack);
          return result;
        } catch (err) {
          capture(level, message, context, stack);
          throw err;
        }
      };

      restores.push(() => {
        owner[method] = original;
      });
    };

    // instance loggers: `new Logger('Ctx').log(...)` — the common case
    const proto = Logger.prototype as unknown as Record<string, unknown>;
    patch(proto, 'log', 'info', true);
    patch(proto, 'error', 'error', true);
    patch(proto, 'warn', 'warn', true);
    patch(proto, 'debug', 'debug', true);
    patch(proto, 'verbose', 'verbose', true);

    // static loggers: `Logger.log(...)`
    const statics = Logger as unknown as Record<string, unknown>;
    patch(statics, 'log', 'info', false);
    patch(statics, 'error', 'error', false);
    patch(statics, 'warn', 'warn', false);
    patch(statics, 'debug', 'debug', false);
    patch(statics, 'verbose', 'verbose', false);

    return () => {
      for (const restore of restores.splice(0)) restore();
    };
  }
}

function resolveSdkAwareLocation(): LogPayload['source'] {
  try {
    const err = new Error();
    const stack = err.stack?.split('\n').slice(3).join('\n');
    return resolveSourceLocation(stack ?? '', { skip: 0 });
  } catch {
    return undefined;
  }
}
