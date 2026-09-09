import type { IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { Redactor, randomId } from '@angelitosystems/devtools-protocol';
import type {
  ProjectInfo,
  RequestCompletedPayload,
  RequestStartedPayload,
  TimelineSpan,
} from '@angelitosystems/devtools-protocol';
import { requestContext } from '@angelitosystems/devtools-core';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';
import type { INestApplication } from '@nestjs/common';

import { emit } from '../emitter';
import { trackSpans } from './timeline';

/** Shared context every instrumentation module receives. */
export interface InstrumentationContext {
  config: DevToolsConfig;
  projectInfo: ProjectInfo;
}

/** Headers captured by default (denylist still applies). */
const INTERESTING_HEADERS = [
  'content-type',
  'content-length',
  'accept',
  'origin',
  'referer',
  'user-agent',
  'x-forwarded-for',
  'x-request-id',
] as const;

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

/** Instrument the HTTP server of a NestJS application. */
export class HttpInstrumentation {
  private readonly redactor: Redactor;

  constructor(private readonly ctx: InstrumentationContext) {
    this.redactor = new Redactor({
      redact: ctx.config.redact,
      allow: ctx.config.allow,
      maxBytes: ctx.config.maxPayloadBytes,
    });
  }

  /** Wrap the underlying HTTP server 'request' event. Returns false when not applicable. */
  attach(app: INestApplication): boolean {
    try {
      const adapter = app.getHttpAdapter();
      if (!adapter || adapter.getType() !== 'http') return false;

      const server = (adapter as unknown as { getHttpServer?: () => HttpServer }).getHttpServer?.();
      if (!server) return false;

      const self = this;
      const originalListeners = server.rawListeners('request') as RequestListener[];
      server.removeAllListeners('request');

      const wrapped: RequestListener = (req, res) => {
        self.instrumentRequest(req, res, () => {
          for (const listener of originalListeners) {
            listener.call(server, req, res);
          }
        });
      };

      server.on('request', wrapped);
      return true;
    } catch {
      return false;
    }
  }

  /** Wrap a single request lifecycle. */
  private instrumentRequest(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    if (!this.ctx.config.capture.requests) {
      next();
      return;
    }

    const startedAt = Date.now();
    const requestId = randomId('req');
    const method = (req.method ?? 'GET').toUpperCase();
    const rawUrl = req.url ?? '/';
    const url = safeUrlPath(rawUrl);

    const spans: TimelineSpan[] = [];
    const unregister = trackSpans(requestId, spans);
    res.once('finish', unregister);

    const started: RequestStartedPayload = {
      requestId,
      projectId: this.ctx.projectInfo.projectId,
      method,
      url,
      headers: this.collectHeaders(req),
      query: parseQuery(rawUrl),
      ip: clientIp(req),
      userAgent: asString(req.headers['user-agent']) || undefined,
      startedAt,
    };

    const middlewareSpan: TimelineSpan = {
      layer: 'middleware',
      label: `${method} ${url}`,
      duration: 0,
      startedAt,
      status: 'ok',
    };
    spans.push(middlewareSpan);

    const onFinished = () => {
      const finishedAt = Date.now();
      middlewareSpan.duration = Math.max(0, finishedAt - middlewareSpan.startedAt);
      middlewareSpan.status = res.statusCode >= 500 ? 'error' : 'ok';

      const responseSpan: TimelineSpan = {
        layer: 'response',
        label: 'response',
        duration: 0,
        startedAt: finishedAt,
        status: 'ok',
      };
      spans.push(responseSpan);

      const completed: RequestCompletedPayload = {
        requestId,
        projectId: this.ctx.projectInfo.projectId,
        method,
        url,
        statusCode: res.statusCode,
        duration: finishedAt - startedAt,
        startedAt,
        timeline: spans,
        query: parseQuery(rawUrl),
        errored: res.statusCode >= 500,
      };

      emit('request.completed', completed);
    };

    const context = requestContext();
    context.run({ requestId, method, url, startedAt }, () => {
      emit('request.started', started);
      res.once('finish', onFinished);
      next();
    });
  }

  private collectHeaders(req: IncomingMessage): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of INTERESTING_HEADERS) {
      const value = req.headers[key];
      if (value === undefined) continue;
      out[key] = this.redactor.isSensitive(key) ? '[REDACTED]' : asString(value).slice(0, 200);
    }
    return out;
  }
}

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

function safeUrlPath(raw: string): string {
  const index = raw.indexOf('?');
  return index === -1 ? raw : raw.slice(0, index);
}

function parseQuery(raw: string): Record<string, unknown> {
  const index = raw.indexOf('?');
  if (index === -1) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(raw.slice(index + 1))) {
    out[key] = value;
  }
  return out;
}

function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.socket?.remoteAddress ?? undefined;
}

export { safeUrlPath, parseQuery, clientIp };
