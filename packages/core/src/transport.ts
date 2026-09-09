import WebSocket from 'ws';
import { createMessage, parseMessage, randomId } from '@angelitosystems/devtools-protocol';
import type { DevToolsEventName, DevToolsEventMap, DevToolsMessage } from '@angelitosystems/devtools-protocol';

/** How the transport currently stands. */
export type TransportState = 'connecting' | 'open' | 'closed' | 'retrying';

/** Callback invoked for server-initiated messages. */
export type OnServerMessage = (message: DevToolsMessage) => void;

/**
 * Resilient WebSocket transport for the SDK.
 *
 * - never throws: every failure is swallowed and retried with backoff
 * - buffers messages while offline (bounded ring buffer)
 * - batches small messages into a single frame when possible
 */
export class DevToolsTransport {
  private ws: WebSocket | null = null;
  private state: TransportState = 'closed';
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private buffer: DevToolsMessage[] = [];
  private readonly batch: DevToolsMessage[] = [];
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly options: {
      projectId: string;
      token?: string;
      bufferSize?: number;
      batchMax?: number;
      flushInterval?: number;
      maxPayloadBytes?: number;
      onMessage?: OnServerMessage;
    },
  ) {}

  /** Begin connecting (async, non-blocking, never throws). */
  start(): void {
    this.stopped = false;
    this.connect();
    const interval = this.options.flushInterval ?? 150;
    this.flushTimer = setInterval(() => this.flush(), interval);
    // don't hold the event loop open just for flushing
    this.flushTimer.unref?.();
  }

  /** Close the connection and stop retrying. */
  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.retryTimer = null;
    this.flushTimer = null;
    try {
      this.ws?.close(1000, 'sdk-stopped');
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.state = 'closed';
  }

  /** Current connection state. */
  getState(): TransportState {
    return this.state;
  }

  /** Number of messages waiting to be delivered. */
  pending(): number {
    return this.buffer.length + this.batch.length;
  }

  /**
   * Queue a typed event. Fire-and-forget: returns immediately, applies
   * sampling/drop policies and never blocks the caller.
   */
  send<K extends DevToolsEventName>(event: K, payload: DevToolsEventMap[K]): void {
    const message = createMessage(event, payload, { projectId: this.options.projectId });
    this.enqueue(message);
  }

  private enqueue(message: DevToolsMessage): void {
    const cap = this.options.bufferSize ?? 5000;
    if (this.state === 'open') {
      this.batch.push(message);
      if (this.batch.length >= (this.options.batchMax ?? 50)) this.flush();
      // hard cap for unsent batches
      if (this.batch.length > cap) this.batch.splice(0, this.batch.length - cap);
    } else {
      this.buffer.push(message);
      if (this.buffer.length > cap) this.buffer.splice(0, this.buffer.length - cap);
    }
  }

  /** Try to deliver everything queued. Safe to call repeatedly. */
  flush(): void {
    if (this.state !== 'open') return;
    const messages = [...this.buffer.splice(0), ...this.batch.splice(0)];
    if (messages.length === 0) return;

    // one frame per message, but honor max payload; oversized messages are dropped
    const maxBytes = this.options.maxPayloadBytes ?? 256 * 1024;
    for (const message of messages) {
      try {
        const raw = JSON.stringify(message);
        if (raw.length > maxBytes) continue; // drop oversized payload silently
        this.ws?.send(raw);
      } catch {
        // connection died mid-flush: re-buffer a bounded amount
        this.buffer.push(message);
        if (this.buffer.length > (this.options.bufferSize ?? 5000)) this.buffer.shift();
        break;
      }
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.state = this.retry === 0 ? 'connecting' : 'retrying';
    const url = new URL(this.url);
    url.searchParams.set('projectId', this.options.projectId);
    if (this.options.token) url.searchParams.set('token', this.options.token);

    try {
      this.ws = new WebSocket(url.toString());
    } catch {
      this.scheduleRetry();
      return;
    }

    this.ws.on('open', () => {
      this.state = 'open';
      this.retry = 0;
      this.flush();
    });

    this.ws.on('message', (data) => {
      try {
        const text = typeof data === 'string' ? data : data.toString();
        const message = parseMessage(text);
        if (message) this.options.onMessage?.(message);
      } catch {
        /* ignore malformed frames */
      }
    });

    this.ws.on('error', () => {
      /* error is always followed by close; stay silent */
    });

    this.ws.on('close', () => {
      this.ws = null;
      if (!this.stopped) this.scheduleRetry();
      else this.state = 'closed';
    });
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.state = 'retrying';
    const delay = Math.min(30000, 500 * 2 ** Math.min(this.retry, 5)) + Math.random() * 250;
    this.retry += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
    this.retryTimer.unref?.();
  }
}

/** Build a control-plane message (client.hello, stream.pause, ...). */
export function controlMessage<K extends DevToolsEventName>(
  event: K,
  payload: DevToolsEventMap[K],
  projectId?: string,
): DevToolsMessage<DevToolsEventMap[K]> {
  return createMessage(event, payload, { projectId: projectId ?? randomId('ctrl') });
}
