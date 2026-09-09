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
import { recordSpan, trackSpans } from './timeline';
import { resolveSourceLocation } from '@angelitosystems/devtools-core';
import { SourceLocation } from '@angelitosystems/devtools-protocol';

/** Shared context every instrumentation module receives. */
export interface InstrumentationContext {
  config: DevToolsConfig;
  projectInfo: ProjectInfo;
}

/** Request headers captured by default (denylist still applies). */
const REQUEST_HEADERS = [
  'content-type',
  'content-length',
  'accept',
  'origin',
  'referer',
  'user-agent',
  'x-forwarded-for',
  'x-request-id',
  'x-forwarded-proto',
] as const;

/** Response headers captured by default. */
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'location',
  'set-cookie',
  'x-request-id',
  'x-response-time',
] as const;

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

const WRAPPED = Symbol('nest-devtools.wrapped');

/**
 * Instrument the HTTP server of a NestJS application.
 *
 * Covers both bootstrap orders without touching Node module internals:
 *  - `NestDevTools.init(app)` after `app.listen()`: the server already exists
 *    and is wrapped immediately.
 *  - `NestDevTools.init(app)` before `app.listen()` (recommended): `app.listen`
 *    is wrapped so the server is wrapped the moment it exists.
 */
export class HttpInstrumentation {
  private readonly redactor: Redactor;

  constructor(private readonly ctx: InstrumentationContext) {
    this.redactor = new Redactor({
      redact: ctx.config.redact,
      allow: ctx.config.allow,
      maxBytes: ctx.config.maxPayloadBytes,
    });
  }

  /** Begin capturing HTTP requests. Returns a cleanup function. */
  attach(app: INestApplication): () => void {
    try {
      const adapter = app.getHttpAdapter();
      // 'http' = platform-default adapter, 'express' = @nestjs/platform-express
      if (!adapter || !['http', 'express'].includes(adapter.getType())) return () => {};

      const getServer = (): HttpServer | undefined =>
        (adapter as unknown as { getHttpServer?: () => HttpServer }).getHttpServer?.();

      // 1) server already exists (init called after listen)
      const existing = getServer();
      if (existing) {
        this.wrapServer(existing);
        return () => {};
      }

      // 2) init called before listen: wrap the server once listen() resolves
      const appLike = app as unknown as { listen: (...args: unknown[]) => unknown };
      const originalListen = appLike.listen.bind(app);
      const self = this;
      const patchedListen = (...args: unknown[]) => {
        const result = originalListen(...args);
        Promise.resolve(result)
          .then(() => {
            const server = getServer();
            if (server) self.wrapServer(server);
          })
          .catch(() => {
            /* listen failed — the app will surface its own error */
          });
        return result;
      };
      appLike.listen = patchedListen;

      return () => {
        appLike.listen = originalListen;
      };
    } catch {
      return () => {};
    }
  }

  /** Wrap the 'request' listeners of a server exactly once. */
  private wrapServer(server: HttpServer): void {
    const target = server as unknown as Record<symbol, unknown>;
    if (target[WRAPPED]) return;
    target[WRAPPED] = true;

    const self = this;
    const originalListeners = server.rawListeners('request') as RequestListener[];

    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      self.instrumentRequest(req, res, () => {
        for (const listener of originalListeners) {
          listener.call(server, req, res);
        }
      });
    });
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
      route: routeFromReq(req),
      headers: this.collectRequestHeaders(req),
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

    const capturedBody = this.ctx.config.capture.requests && this.ctx.config.maxPayloadBytes > 0
      ? captureRequestPreview(req, this.redactor)
      : undefined;

    const onFinished = () => {
      const finishedAt = Date.now();
      middlewareSpan.duration = Math.max(0, finishedAt - middlewareSpan.startedAt);
      middlewareSpan.status = res.statusCode >= 500 ? 'error' : 'ok';

      const responseSpan: TimelineSpan = {
        layer: 'response',
        label: 'response',
        duration: 0,
        startedAt: finishedAt,
        status: res.statusCode >= 400 ? 'error' : 'ok',
      };
      spans.push(responseSpan);

      const responseHeaders = this.collectResponseHeaders(res);
      const responsePreview = this.ctx.config.capture.requests && this.ctx.config.maxPayloadBytes > 0
        ? captureResponsePreview(res, this.redactor)
        : undefined;

      const errored = res.statusCode >= 500;

      const completed: RequestCompletedPayload = {
        requestId,
        projectId: this.ctx.projectInfo.projectId,
        method,
        url,
        route: routeFromReq(req),
        statusCode: res.statusCode,
        duration: finishedAt - startedAt,
        startedAt,
        timeline: spans,
        query: parseQuery(rawUrl),
        headers: responseHeaders,
        responsePreview,
        requestBody: capturedBody,
        errored,
      };

      emit('request.completed', completed);

      // NestJS exception filters turn controller errors into 5xx responses
      // without any process-level signal — surface them in the Error Explorer.
      if (errored) {
        emit('error.created', {
          requestId,
          projectId: this.ctx.projectInfo.projectId,
          name: 'HttpError',
          message: `${method} ${url} failed with status ${res.statusCode}`,
          fingerprint: httpErrorFingerprint(method, url, res.statusCode),
          request: { method, url, statusCode: res.statusCode },
          timestamp: finishedAt,
        });
      }
    };

    const context = requestContext();
    context.run({ requestId, method, url, startedAt }, () => {
      emit('request.started', started);
      res.once('finish', onFinished);
      next();
    });
  }

  private collectRequestHeaders(req: IncomingMessage): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of REQUEST_HEADERS) {
      const value = req.headers[key];
      if (value === undefined) continue;
      out[key] = this.redactor.isSensitive(key) ? '[REDACTED]' : asString(value).slice(0, 200);
    }
    return out;
  }

  private collectResponseHeaders(res: ServerResponse): Record<string, string> {
    const out: Record<string, string> = {};
    const headers = (res as unknown as Record<string, unknown>)._headers;
    if (!headers || typeof headers !== 'object') return out;

    for (const rawKey of Object.keys(headers)) {
      const key = rawKey.toLowerCase();
      const ok = RESPONSE_HEADERS.some((h) => h.toLowerCase() === key);
      if (!ok) continue;
      const raw = (headers[rawKey] as string | number | undefined) ?? '';
      const value = String(raw);
      if (value === '') continue;
      out[key] = this.redactor.isSensitive(key) ? '[REDACTED]' : value.slice(0, 200);
    }
    return out;
  }
}

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

/** Stable fingerprint for framework-handled HTTP failures. */
function httpErrorFingerprint(method: string, url: string, statusCode: number): string {
  const route = url.replace(/\/\d+(?=\/|$)/g, '/:id'); // group /users/15 with /users/16
  const raw = `${method}::${route}::${statusCode}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
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

/** Best-effort route extraction from Express/Nest request. */
function routeFromReq(req: IncomingMessage): string | undefined {
  try {
    const http = req as unknown as { httpVersion?: string };
    const out: RequestStartedPayload = {
      requestId: '',
      projectId: '',
      method: '',
      url: '',
      route: undefined,
      headers: {},
      query: {},
      ip: undefined,
      userAgent: undefined,
      startedAt: 0,
    };
    const route = (req as unknown as Record<string, unknown>).route;
    if (route && typeof route === 'object' && route !== null) {
      const name = (route as { name?: string }).name;
      if (typeof name === 'string' && name.length > 0) return name;
    }
    const path = (req as unknown as { baseUrl?: string }).baseUrl
      ?? (req as any).path;
    if (typeof path === 'string' && path.length > 0) return path;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Capture a safe preview of the request body (limited, redacted). */
function captureRequestPreview(req: IncomingMessage, redactor: Redactor): unknown {
  try {
    const body = (req as unknown as Record<string, unknown>).body;
    if (body === undefined || body === null) return undefined;
    return redactor.redact(body);
  } catch {
    return undefined;
  }
}

/** Capture a safe preview of the response body after the response finishes. */
function captureResponsePreview(res: ServerResponse, redactor: Redactor): unknown {
  try {
    const resLike = res as unknown as Record<string, unknown>;
    const body = resLike.body;
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string') return redactor.redactString(body);
    return redactor.redact(body);
  } catch {
    return undefined;
  }
}

export { safeUrlPath, parseQuery, clientIp, routeFromReq };
