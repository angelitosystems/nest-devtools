import type { TimelineSpan } from '@angelitosystems/devtools-protocol';

/** Create a started span inside a request's span list. */
export function startSpan(spans: TimelineSpan[], layer: string, label: string, detail?: string): TimelineSpan {
  const span: TimelineSpan = {
    layer,
    label,
    duration: 0,
    startedAt: Date.now(),
    status: 'ok',
    ...(detail !== undefined ? { detail } : {}),
  };
  spans.push(span);
  return span;
}

/** Finalize a span, computing its duration. */
export function endSpan(span: TimelineSpan, status?: 'ok' | 'error'): void {
  span.duration = Math.max(0, Date.now() - span.startedAt);
  if (status) span.status = status;
}

/**
 * Registry of active request timelines, keyed by requestId.
 * Lets deeper instrumentation (database, websockets) attach spans to the
 * request that caused them, using the AsyncLocalStorage request id.
 */
const recorders = new Map<string, TimelineSpan[]>();

/** Register a request's span list. Returns an unregister callback. */
export function trackSpans(requestId: string, spans: TimelineSpan[]): () => void {
  recorders.set(requestId, spans);
  return () => recorders.delete(requestId);
}

/** Add an auto-ended span to a request if it is still active. */
export function recordSpan(requestId: string, layer: string, label: string, detail?: string, status?: 'ok' | 'error'): void {
  const spans = recorders.get(requestId);
  if (!spans) return;
  const span = startSpan(spans, layer, label, detail);
  endSpan(span, status);
}
