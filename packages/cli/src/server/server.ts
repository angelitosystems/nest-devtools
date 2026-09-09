import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createMessage, parseMessage } from '@angelitosystems/devtools-protocol';
import type {
  DevToolsEventName,
  DevToolsMessage,
  ProjectInfo,
  StateSnapshot,
} from '@angelitosystems/devtools-protocol';
import { DashboardStore } from './store';
import type { ServerStatus } from './types';

export interface DevToolsServerOptions {
  /** Dashboard HTTP port. Default 4317. */
  httpPort?: number;
  /** SDK WebSocket port. Default 4318. */
  wsPort?: number;
  /** Host to bind. Default localhost. */
  host?: string;
  /** Directory containing the built dashboard (index.html + assets). */
  dashboardDir?: string;
  /** Called on lifecycle changes for CLI feedback. */
  onEvent?: (
    event: 'started' | 'project-connected' | 'project-disconnected' | 'dashboard-connected',
    data?: unknown,
  ) => void;
}

/** Query param marking a connection as a dashboard/CLI client. */
const DASHBOARD_PARAM = 'client';

/** Registered event names a project may stream to the server. */
const PROJECT_EVENTS: DevToolsEventName[] = [
  'request.started',
  'request.completed',
  'log.created',
  'error.created',
  'query.executed',
  'websocket.connected',
  'websocket.message',
  'performance.updated',
  'app.snapshot',
];

/**
 * Local DevTools server.
 *
 *   http://localhost:4317  – dashboard (static) + /health + /api/state
 *                            + WebSocket for dashboard clients at /ws?client=dashboard
 *   ws://localhost:4318    – SDK connections: ws://localhost:4318?projectId=<id>
 *
 * A single WebSocketServer upgrades connections from both HTTP servers.
 */
export class DevToolsServer {
  private readonly httpServer: Server;
  private readonly wsHttpServer: Server;
  private readonly wss: WebSocketServer;
  private store = new DashboardStore();
  private startedAt: number | null = null;
  private readonly projectSockets = new Map<WebSocket, string>();
  private readonly dashboardSockets = new Set<WebSocket>();

  constructor(private readonly options: DevToolsServerOptions = {}) {
    this.httpServer = createServer((req, res) => serveDashboard(req, res, this.options.dashboardDir));
    this.wsHttpServer = createServer((_req, res) => {
      res.writeHead(426);
      res.end('Upgrade Required');
    });
    this.wss = new WebSocketServer({ noServer: true });

    const handleUpgrade = (req: IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req));
    };
    this.httpServer.on('upgrade', handleUpgrade);
    this.wsHttpServer.on('upgrade', handleUpgrade);
  }

  /** Start listening. Resolves once both servers are ready. */
  async start(): Promise<void> {
    const host = this.options.host ?? 'localhost';
    const httpPort = this.options.httpPort ?? 4317;
    const wsPort = this.options.wsPort ?? 4318;
    await listen(this.httpServer, host, httpPort);
    await listen(this.wsHttpServer, host, wsPort);
    this.startedAt = Date.now();
    this.options.onEvent?.('started', { httpPort, wsPort });
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    for (const ws of this.projectSockets.keys()) safeClose(ws);
    for (const ws of this.dashboardSockets) safeClose(ws);
    await close(this.wss);
    await close(this.wsHttpServer);
    await close(this.httpServer);
    this.startedAt = null;
  }

  /** Current status snapshot (CLI + doctor). */
  status(): ServerStatus {
    const counters = this.store.counters();
    return {
      running: this.startedAt !== null,
      httpPort: this.options.httpPort ?? 4317,
      wsPort: this.options.wsPort ?? 4318,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      projects: this.store.listProjects(),
      dashboardClients: this.dashboardSockets.size,
      ...counters,
    };
  }

  /** Access the store (tests / advanced usage). */
  getStore(): DashboardStore {
    return this.store;
  }

  // ------------------------------------------------------------------ wiring

  private onConnection(ws: WebSocket, request: IncomingMessage): void {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const projectId = url.searchParams.get('projectId');
    const isDashboard = url.searchParams.get(DASHBOARD_PARAM) !== null || !projectId;

    if (isDashboard) {
      this.dashboardSockets.add(ws);
      this.options.onEvent?.('dashboard-connected');
      safeSend(ws, createMessage('client.welcome', { serverVersion: '0.1.0', protocol: 1 }));
      safeSend(ws, createMessage('state.snapshot', this.store.snapshot()));
      ws.on('message', (raw) => this.onDashboardMessage(ws, raw.toString()));
      ws.on('close', () => this.dashboardSockets.delete(ws));
      return;
    }

    // project connection
    this.projectSockets.set(ws, projectId);
    ws.on('message', (raw) => this.onProjectMessage(ws, projectId, raw.toString()));
    ws.on('close', () => {
      this.projectSockets.delete(ws);
      this.store.disconnectProject(projectId, 'socket closed');
      this.options.onEvent?.('project-disconnected', { projectId });
      this.broadcastToDashboards(
        createMessage('project.disconnected', { projectId, reason: 'socket closed' }, { projectId }),
      );
    });

    // SDK metadata arrives via project.connected. For now, broadcast a minimal
    // entry so dashboards can show the project as connected while metadata is pending.
    const placeholder: ProjectInfo = {
      projectId,
      projectName: projectId,
      environment: 'development',
      hostname: 'unknown',
      port: null,
      pid: 0,
      runtime: 'node',
      runtimeVersion: 'unknown',
      nodeVersion: process.version,
      nestjsVersion: null,
      sdkVersion: 'unknown',
    };
    this.store.upsertProject(placeholder);
    this.store.upsertProject(placeholder);
    this.options.onEvent?.('project-connected', { projectId, projectName: projectId });
    this.broadcastToDashboards(createMessage('project.connected', placeholder, { projectId }));

    ws.on('message', (raw) => this.onProjectMessage(ws, projectId, raw.toString()));
  }

  private onProjectMessage(ws: WebSocket, projectId: string, raw: string): void {
    const message = parseMessage(raw);
    if (!message) return;
    if (!PROJECT_EVENTS.includes(message.event)) return;

    message.projectId = projectId;
    this.store.apply(message, projectId);
    this.forwardToDashboards(message);
  }

  private onDashboardMessage(ws: WebSocket, raw: string): void {
    const message = parseMessage(raw);
    if (!message) return;
    switch (message.event) {
      case 'client.hello':
        break;
      case 'stream.pause':
      case 'stream.resume':
        this.forwardToDashboards(message);
        break;
      case 'state.clear': {
        const scope = (message.payload as { scope?: 'logs' | 'requests' | 'errors' | 'queries' | 'all' }).scope ?? 'all';
        this.store.clear(scope);
        safeSend(ws, createMessage('state.ack', { ok: true }));
        const snap = createMessage('state.snapshot', this.store.snapshot());
        for (const dashboard of this.dashboardSockets) safeSend(dashboard, snap);
        break;
      }
      default:
        break;
    }
  }

  private forwardToDashboards(message: DevToolsMessage): void {
    for (const dashboard of this.dashboardSockets) {
      safeSend(dashboard, message);
    }
  }

  private broadcastToDashboards(message: DevToolsMessage): void {
    this.forwardToDashboards(message);
  }
}

function placeholderProjectInfo(projectId: string): ProjectInfo {
  return {
    projectId,
    projectName: projectId,
    environment: 'development',
    hostname: 'unknown',
    port: null,
    pid: 0,
    runtime: 'node',
    runtimeVersion: 'unknown',
    nodeVersion: process.version,
    nestjsVersion: null,
    sdkVersion: 'unknown',
  };
}

// --------------------------------------------------------------------- http

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Minimal static file server for the built dashboard + API endpoints. */
export function serveDashboard(req: IncomingMessage, res: ServerResponse, dashboardDir?: string): void {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: '0.1.0' }));
    return;
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        endpoints: {
          sdk: 'ws://localhost:4318?projectId=<id>',
          dashboard: 'ws://localhost:4317/ws?client=dashboard',
        },
      }),
    );
    return;
  }

  if (!dashboardDir || !existsSync(dashboardDir)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fallbackDashboardHtml());
    return;
  }

  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let filePath = join(dashboardDir, requested || 'index.html');
  if (!filePath.startsWith(normalize(dashboardDir))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(dashboardDir, 'index.html'); // SPA fallback
  }

  const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime });
  createReadStream(filePath).pipe(res);
}

/** Placeholder page when the dashboard app has not been built yet. */
function fallbackDashboardHtml(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>NestJS DevTools</title>
  <style>
    body { background: #0b0f17; color: #e2e8f0; font-family: ui-monospace, monospace;
           display: grid; place-items: center; height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { font-size: 20px; }
    p { color: #94a3b8; }
    code { color: #7dd3fc; }
  </style></head>
  <body>
    <div class="box">
      <h1>NestJS DevTools</h1>
      <p>DevTools server is running. SDK endpoint: <code>ws://localhost:4318</code></p>
      <p>Build the dashboard with <code>bun run build</code> in <code>apps/dashboard</code>.</p>
    </div>
  </body>
</html>`;
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function close(target: { close: (cb: () => void) => void }): Promise<void> {
  return new Promise((resolve) => target.close(() => resolve()));
}

function safeSend(ws: WebSocket, message: DevToolsMessage): void {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  } catch {
    /* ignore */
  }
}

function safeClose(ws: WebSocket): void {
  try {
    ws.close(1001, 'server stopping');
  } catch {
    /* ignore */
  }
}

export type { StateSnapshot };
