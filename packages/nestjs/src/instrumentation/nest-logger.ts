import { Redactor } from '@angelitosystems/devtools-protocol';
import type { LogPayload, LogLevel, ProjectInfo } from '@angelitosystems/devtools-protocol';
import { requestContext, resolveSourceLocation } from '@angelitosystems/devtools-core';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';

import { emit } from '../emitter';

/**
 * Captures NestJS framework logs (`Logger.log/error/warn/debug/verbose` and
 * `logger.log()` in services). Nest's Logger writes through process.stdout
 * internals, not console.*, so it needs its own hook.
 */
export class LoggerInstrumentation {
  private readonly redactor: Redactor;

  constructor(ctx: { config: DevToolsConfig; projectInfo: ProjectInfo }) {
    this.redactor = new Redactor({
      redact: ctx.config.redact,
      allow: ctx.config.allow,
      maxBytes: ctx.config.maxPayloadBytes,
    });
  }

  /** Patch the static Logger methods. Returns a restore function. */
  attach(): () => void {
    // Lazy import keeps the SDK usable if @nestjs/common is absent for some reason.
    let LoggerCtor: (typeof import('@nestjs/common'))['Logger'] | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      LoggerCtor = require('@nestjs/common').Logger;
    } catch {
      return () => {};
    }
    if (!LoggerCtor) return () => {};

    const restores: Array<() => void> = [];
    const self = this;

    const patch = (method: 'log' | 'error' | 'warn' | 'debug' | 'verbose', level: LogLevel) => {
      const owner = LoggerCtor as unknown as Record<string, unknown>;
      const original = owner[method];
      if (typeof original !== 'function') return;

      owner[method] = function (
        this: unknown,
        message: unknown,
        context?: string,
        stack?: string,
      ) {
        try {
          const result = (original as (...a: unknown[]) => unknown).apply(this, [message, context, stack]);
          self.capture(level, message, context, stack);
          return result;
        } catch (err) {
          self.capture(level, message, context, stack);
          throw err;
        }
      };

      restores.push(() => {
        owner[method] = original;
      });
    };

    patch('log', 'info');
    patch('error', 'error');
    patch('warn', 'warn');
    patch('debug', 'debug');
    patch('verbose', 'verbose');

    return () => {
      for (const restore of restores.splice(0)) restore();
    };
  }

  private capture(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    if (!this.ctx.config.capture.logs) return;
    try {
      const text = typeof message === 'string' ? message : this.redactor.serialize(message);
      const payload: LogPayload = {
        projectId: this.ctx.projectInfo.projectId,
        level,
        message: this.redactor.redactString(text),
        source: stack
          ? undefined
          : resolveSdkAwareLocation(),
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
