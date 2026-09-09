import type { DevToolsMessage, StateSnapshot } from '@angelitosystems/devtools-protocol';

export type ConnectionState = 'connecting' | 'open' | 'closed';
export type ConnectionListener = (message: DevToolsMessage) => void;

/**
 * Singleton WebSocket connection to the DevTools server.
 * Auto-reconnects and fans out typed messages to subscribers.
 */
export class DevToolsConnection {
  private ws: WebSocket | null = null;
  private listeners = new Set<ConnectionListener>();
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private retry = 0;
  private stopped = false;
  private _state: ConnectionState = 'closed';

  constructor(private readonly url: string) {}

  get state(): ConnectionState {
    return this._state;
  }

  /** Connect (or reconnect). */
  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
  }

  onMessage(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this._state);
    return () => this.stateListeners.delete(listener);
  }

  /** Send a control message (state.clear, stream.pause...). */
  send(event: DevToolsMessage['event'], payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          v: 1,
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
          ts: Date.now(),
          event,
          payload,
        }),
      );
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.setState('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.setState('open');
      this.send('client.hello', { kind: 'dashboard', name: 'nest-devtools-dashboard' });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as DevToolsMessage;
        for (const listener of this.listeners) listener(message);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.stopped) {
        this.setState('closed');
        return;
      }
      this.setState('closed');
      const delay = Math.min(5000, 500 * 2 ** Math.min(this.retry++, 4));
      setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => {
      /* close handler drives reconnection */
    };
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

/** Derive the WS URL from the current page location (works behind the Vite proxy too). */
export function resolveWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:4317/ws?client=dashboard';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?client=dashboard`;
}

/** Latest full snapshot cache for immediate UI hydration. */
export interface HydrationState {
  snapshot: StateSnapshot | null;
}

export const hydration: HydrationState = { snapshot: null };
