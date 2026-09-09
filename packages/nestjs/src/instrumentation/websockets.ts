import type { InstrumentationContext } from './http';

/**
 * WebSocket gateway instrumentation (v0.3 roadmap).
 *
 * Will introspect @WebSocketGateway() classes via the Nest container and wrap
 * gateway handlers. The placeholder keeps the init() wiring stable and
 * guarantees zero interference with host sockets.
 */
export class WebsocketInstrumentation {
  constructor(private readonly ctx: InstrumentationContext) {}

  /** No-op for now. Returns a no-op cleanup. */
  attach(): () => void {
    void this.ctx;
    return () => {};
  }
}
