import { AsyncLocalStorage } from 'async_hooks';

/** Correlation data attached to every event of a request. */
export interface RequestContext {
  requestId: string;
  traceId?: string;
  userId?: string;
  sessionId?: string;
  method?: string;
  url?: string;
  route?: string;
  startedAt: number;
}

/**
 * AsyncLocalStorage-based request context. Falls back to a pass-through
 * implementation if ALS misbehaves, so the SDK never breaks the host app.
 */
class ContextManager {
  private readonly als: AsyncLocalStorage<RequestContext>;

  constructor() {
    this.als = new AsyncLocalStorage<RequestContext>();
  }

  /** Run a callback with a bound request context. */
  run<T>(context: RequestContext, callback: () => T): T {
    try {
      return this.als.run(context, callback);
    } catch {
      return callback();
    }
  }

  /** Current context if any (undefined outside a request). */
  current(): RequestContext | undefined {
    try {
      return this.als.getStore();
    } catch {
      return undefined;
    }
  }

  /** Patch the active context (e.g. after authentication sets userId). */
  patch(patch: Partial<RequestContext>): void {
    const current = this.current();
    if (current) Object.assign(current, patch);
  }

  /** Request id of the active context, if any. */
  requestId(): string | undefined {
    return this.current()?.requestId;
  }
}

let globalManager: ContextManager | undefined;

/** Shared context manager (one per process). */
export function requestContext(): ContextManager {
  globalManager ??= new ContextManager();
  return globalManager;
}
