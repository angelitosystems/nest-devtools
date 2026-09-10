import type { InstrumentationContext } from './http';
import type { ProjectInfo, GatewayConnectionPayload, GatewayMessagePayload } from '@angelitosystems/devtools-protocol';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';
import { requestContext } from '@angelitosystems/devtools-core';
import { Redactor, randomId } from '@angelitosystems/devtools-protocol';
import { emit } from '../emitter';
import { recordSpan } from './timeline';

/**
 * WebSocket gateway instrumentation, best-effort.
 *
 * Detects @WebSocketGateway classes via the Nest container and reports
 * connection counts and message flow (received/sent) with redaction.
 * Does not intercept raw sockets unless the gateway exposes them.
 */
export class WebsocketInstrumentation {
  private readonly redactor: Redactor;
  private readonly config: DevToolsConfig;
  private readonly projectId: string;
  private readonly ctxRaw: InstrumentationContext;

  constructor(ctx: InstrumentationContext) {
    this.ctxRaw = ctx;
    this.config = ctx.config;
    this.projectId = ctx.projectInfo.projectId;
    this.redactor = new Redactor({
      redact: this.config.redact,
      allow: this.config.allow,
      maxBytes: this.config.maxPayloadBytes,
    });
  }

  /** Attach gateway hooks. Returns cleanup. */
  attach(): () => void {
    const cleanup: Array<() => void> = [];
    if (!this.config.capture.websockets) return () => cleanup.forEach((fn) => fn());

    const gateways = this.detectGateways();
    for (const gw of gateways) {
      cleanup.push(this.wrapGateway(gw));
    }

    return () => cleanup.forEach((fn) => fn());
  }

  private detectGateways(): Array<{ name: string; instance: any }> {
    try {
      const app = this.getApp();
      if (!app) return [];
      const container = (app as any).container;
      if (!container) return [];
      const modules = container.getModules?.() ?? new Map();
      const out: Array<{ name: string; instance: any }> = [];
      for (const [id, node] of modules) {
        const providers = (node as any).providers;
        if (!providers || !(providers instanceof Map)) continue;
        for (const [key, wrapper] of providers) {
          const w = wrapper as any;
          if (!w || !w.instance) continue;
          const subtype = w.subtype ?? (node.subtype ?? null);
          if (subtype === 'gateway' || (w.instance && w.instance.constructor?.name?.endsWith('Gateway'))) {
            out.push({ name: w.name ?? key, instance: w.instance });
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  private wrapGateway(gw: { name: string; instance: any }): () => void {
    const instance = gw.instance;
    if (!instance || typeof instance !== 'object') return () => {};

    const hooks: Array<() => void> = [];
    const methods = [
      'handleConnection',
      'handleDisconnect',
      'handleEvent',
      'handleMessage',
      'afterInit',
      'beforeHandle',
    ];

    for (const method of methods) {
      if (typeof (instance as any)[method] !== 'function') continue;
      const orig = (instance as any)[method];
      const wrapped = this.buildGatewayWrapper(instance, method, orig);
      (instance as any)[method] = wrapped;
      hooks.push(() => {
        (instance as any)[method] = orig;
      });
    }

    return () => hooks.forEach((fn) => fn());
  }

  private buildGatewayWrapper(
    instance: any,
    method: string,
    original: (...args: any[]) => any,
  ): (...args: any[]) => any {
    return async (...args: any[]) => {
      const started = Date.now();
      const requestId = requestContext().requestId() ?? randomId('ws');

      if (method === 'handleConnection' || method === 'afterInit') {
        emit('websocket.connected', {
          projectId: this.projectId,
          gateway: instance.constructor?.name ?? this.estimateGatewayName(instance),
          namespace: this.estimateNamespace(args),
          connections: this.countConnections(instance),
          timestamp: Date.now(),
        } as GatewayConnectionPayload);
      }

      if (method === 'handleMessage' || method === 'handleEvent') {
        const payload = this.extractPayload(args);
        this.emitMessage('received', instance, args, payload, requestId, started);
        recordSpan(requestId, 'websocket', `ws.receive:${this.estimateEvent(args)}`, {
          detail: `gateway=${instance.constructor?.name} payload=${this.redactor.serialize(payload)}`,
        });
      }

      try {
        const result = await Promise.resolve(original.call(instance, ...args));
        if (method === 'handleMessage' || method === 'handleEvent') {
          const payload = this.extractPayload(args);
          this.emitMessage('sent', instance, args, payload, requestId, started);
          recordSpan(requestId, 'websocket', `ws.send:${this.estimateEvent(args)}`, {
            detail: `gateway=${instance.constructor?.name} payload=${this.redactor.serialize(payload)}`,
            status: 'ok',
          });
        }
        return result;
      } catch (err) {
        if (method === 'handleMessage' || method === 'handleEvent') {
          recordSpan(requestId, 'websocket', `ws.send:${this.estimateEvent(args)}`, {
            detail: `gateway=${instance.constructor?.name} error=${this.redactor.serialize(err)}`,
            status: 'error',
          });
        }
        throw err;
      }
    };
  }

  private emitMessage(
    direction: 'received' | 'sent',
    instance: any,
    args: any[],
    payload: unknown,
    requestId: string,
    startedAt: number,
  ): void {
    const preview = this.redactor.redact(payload);
    const serialized = this.redactor.serialize(payload);
    emit('websocket.message', {
      projectId: this.projectId,
      gateway: instance.constructor?.name ?? this.estimateGatewayName(instance),
      event: this.estimateEvent(args),
      direction,
      payloadSize: Buffer.byteLength(serialized, 'utf8'),
      payloadPreview: preview,
      requestId,
      duration: Date.now() - startedAt,
      timestamp: Date.now(),
    } as GatewayMessagePayload);
  }

  private extractPayload(args: any[]): any {
    for (const arg of args) {
      if (arg && typeof arg === 'object' && !Buffer.isBuffer(arg) && !ArrayBuffer.isView(arg)) {
        return arg;
      }
    }
    return args[0];
  }

  private estimateEvent(args: any[]): string {
    const payload = this.extractPayload(args);
    if (!payload || typeof payload !== 'object') return 'message';
    return (payload.event as string) ?? (payload.type as string) ?? 'message';
  }

  private estimateNamespace(args: any[]): string {
    if (args.length > 0) {
      const first = args[0];
      if (first && typeof first === 'object' && first.namespace) return first.namespace;
    }
    return '/';
  }

  private countConnections(instance: any): number {
    try {
      if (instance.connections && typeof instance.connections === 'function') return instance.connections();
      if (instance.clients && typeof instance.clients === 'function') return instance.clients().size ?? 0;
      return 0;
    } catch {
      return 0;
    }
  }

  private estimateGatewayName(instance: any): string {
    return instance.constructor?.name ?? 'Gateway';
  }

  private getApp(): any {
    try {
      const ctx: any = this.ctxRaw;
      if (ctx.getHttpAdapter) return ctx;
      if (ctx.app) return ctx.app;
      return null;
    } catch {
      return null;
    }
  }
}

