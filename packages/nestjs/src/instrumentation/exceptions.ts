import { basename } from 'path';
import type { ErrorPayload, ProjectInfo, SourceLocation } from '@angelitosystems/devtools-protocol';
import { requestContext, safeStringify, resolveSourceLocation } from '@angelitosystems/devtools-core';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';

import { emit } from '../emitter';

type InstrumentationCtx = {
  config: DevToolsConfig;
  projectInfo: ProjectInfo;
};

/**
 * Global error capture via process-level hooks. Errors handled by NestJS
 * filters surface through request.completed; unexpected errors land here.
 */
export class ExceptionsInstrumentation {
  /** Attach process-level hooks. Returns a detach function. */
  static attach(ctx: InstrumentationCtx): () => void {
    const onUncaught = (error: unknown): void => {
      reportError(error, ctx, { source: 'uncaughtException' });
    };
    const onRejection = (reason: unknown): void => {
      reportError(reason, ctx, { source: 'unhandledRejection' });
    };

    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onRejection);

    return () => {
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onRejection);
    };
  }
}

/** Public helper: report an error manually from anywhere in the app. */
export function captureError(
  error: unknown,
  options?: { context?: string; controller?: string; service?: string },
): void {
  reportError(error, undefined, options);
}

function reportError(
  error: unknown,
  ctx: InstrumentationCtx | undefined,
  options?: { context?: string; controller?: string; service?: string; source?: string },
): void {
  try {
    if (ctx && !ctx.config.capture.errors) return;

    const normalized = normalizeError(error);
    const location = resolveSourceLocation(normalized.error ?? normalized.message, { skip: 1 });
    const projectId = ctx?.projectInfo.projectId ?? basename(process.cwd());

    const payload: ErrorPayload = {
      requestId: requestContext().requestId(),
      projectId,
      name: normalized.name,
      message: normalized.message,
      stack: normalized.error?.stack,
      source: location,
      fingerprint: fingerprint(normalized.name, normalized.message, location),
      context: options?.context ?? options?.source,
      request: currentRequestSummary(),
      controller: options?.controller,
      service: options?.service,
      timestamp: Date.now(),
    };

    emit('error.created', payload);
  } catch {
    /* never propagate */
  }
}

function normalizeError(error: unknown): { error: Error | undefined; name: string; message: string } {
  if (error instanceof Error) {
    return { error, name: error.name, message: error.message };
  }
  if (typeof error === 'string') {
    return { error: undefined, name: 'Unknown', message: error };
  }
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const record = error as Record<string, unknown>;
    return {
      error: undefined,
      name: typeof record['name'] === 'string' ? record['name'] : 'Error',
      message: String(record['message']),
    };
  }
  return { error: undefined, name: 'Unknown', message: safeStringify(error) };
}

function fingerprint(name: string, message: string, location?: SourceLocation): string {
  const raw = name + '::' + message + '::' + (location?.file ?? '') + ':' + String(location?.line ?? '');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

function currentRequestSummary(): { method: string; url: string } | undefined {
  const context = requestContext().current();
  if (!context?.method || !context?.url) return undefined;
  return { method: context.method, url: context.url };
}
