import { Console } from 'console';
import { Redactor } from '@angelitosystems/devtools-protocol';
import { resolveSourceLocation } from '@angelitosystems/devtools-core';
import type { LogPayload, LogLevel, ProjectInfo } from '@angelitosystems/devtools-protocol';
import { requestContext } from '@angelitosystems/devtools-core';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';

import { emit } from '../emitter';

const METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type ConsoleMethod = (typeof METHODS)[number];

const LEVEL_BY_METHOD: Record<ConsoleMethod, LogLevel> = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
};

/** Original console bound directly to the process streams. */
const originalConsole = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  colorMode: 'auto',
});

/** Write through the untouched console (used by DevTools' own logging). */
export function writeOriginalConsole(method: ConsoleMethod, ...args: unknown[]): void {
  const fn = (originalConsole as unknown as Record<string, (...a: unknown[]) => void>)[method];
  if (fn) fn.apply(originalConsole, args);
}

/** Capture console output and mirror it to DevTools. */
export class ConsoleInstrumentation {
  private readonly redactor: Redactor;

  constructor(private readonly ctx: { config: DevToolsConfig; projectInfo: ProjectInfo }) {
    this.redactor = new Redactor({
      redact: ctx.config.redact,
      allow: ctx.config.allow,
      maxBytes: ctx.config.maxPayloadBytes,
    });
  }

  /** Patch console methods. Returns a restore function. */
  attach(): () => void {
    const self = this;
    const restores: Array<() => void> = [];

    for (const method of METHODS) {
      const original = (console as unknown as Record<string, unknown>)[method];
      if (typeof original !== 'function') continue;

      const patched = (...args: unknown[]) => {
        try {
          (original as (...a: unknown[]) => void).apply(console, args);
        } catch {
          /* never break host logging */
        }
        self.capture(method, args);
      };

      (console as unknown as Record<string, unknown>)[method] = patched;
      restores.push(() => {
        (console as unknown as Record<string, unknown>)[method] = original;
      });
    }

    return () => {
      for (const restore of restores.splice(0)) restore();
    };
  }

  private capture(method: ConsoleMethod, args: unknown[]): void {
    if (!this.ctx.config.capture.logs) return;
    try {
      const level = LEVEL_BY_METHOD[method];
      const payload: LogPayload = {
        projectId: this.ctx.projectInfo.projectId,
        level,
        message: formatMessage(args, this.redactor),
        arguments: args.length > 0 ? (this.redactor.redact(args) as unknown[]) : undefined,
        stack: method === 'error' ? captureStack() : undefined,
        source: resolveSourceLocation(captureStack() ?? '', { skip: 0 }),
        context: undefined,
        processId: process.pid,
        requestId: requestContext().requestId(),
        timestamp: Date.now(),
      };
      if (method === 'error') payload.level = 'error';
      emit('log.created', payload);
    } catch {
      /* never propagate */
    }
  }
}

function formatMessage(args: unknown[], redactor: Redactor): string {
  if (args.length === 0) return '';
  const first = args[0];
  if (typeof first === 'string') {
    return args.length === 1 ? redactor.redactString(first) : `${first} ${redactor.serialize(args.slice(1))}`;
  }
  return redactor.serialize(args);
}

function captureStack(): string | undefined {
  const err = new Error();
  const stack = err.stack;
  if (!stack) return undefined;
  // drop the frames created by this helper
  return stack.split('\n').slice(3).join('\n');
}
