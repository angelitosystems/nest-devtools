/** Wire protocol version. Bump on breaking payload changes. */
export const PROTOCOL_VERSION = 1 as const;

/** JSON-RPC-ish envelope shared by every message on the wire. */
export interface DevToolsMessage<T = unknown> {
  /** Envelope format version. */
  v: typeof PROTOCOL_VERSION;
  /** Unique message id. */
  id: string;
  /** Originating project (absent for client->server handshake-less control traffic). */
  projectId?: string;
  /** Milliseconds since epoch. */
  ts: number;
  /** Event discriminator. */
  event: DevToolsEventName;
  /** Event payload. */
  payload: T;
}

/** All event names supported by protocol v1. */
export type DevToolsEventName =
  // lifecycle
  | 'project.connected'
  | 'project.disconnected'
  // http
  | 'request.started'
  | 'request.completed'
  // observability
  | 'log.created'
  | 'error.created'
  | 'query.executed'
  // realtime
  | 'websocket.connected'
  | 'websocket.message'
  // perf
  | 'performance.updated'
  // application graph
  | 'app.snapshot'
  // control plane
  | 'client.hello'
  | 'client.welcome'
  | 'stream.pause'
  | 'stream.resume'
  | 'state.clear'
  | 'state.snapshot'
  | 'state.ack'
  | 'error';

/** Union of every typed payload keyed by its event name. */
export interface DevToolsEventMap {
  'project.connected': ProjectInfo;
  'project.disconnected': { projectId: string; reason?: string };
  'request.started': RequestStartedPayload;
  'request.completed': RequestCompletedPayload;
  'log.created': LogPayload;
  'error.created': ErrorPayload;
  'query.executed': QueryPayload;
  'websocket.connected': GatewayConnectionPayload;
  'websocket.message': GatewayMessagePayload;
  'performance.updated': PerformanceSnapshot;
  'app.snapshot': AppSnapshot;
  'client.hello': ClientHello;
  'client.welcome': { serverVersion: string; protocol: typeof PROTOCOL_VERSION };
  'stream.pause': Record<string, never>;
  'stream.resume': Record<string, never>;
  'state.clear': { scope: 'logs' | 'requests' | 'errors' | 'queries' | 'all' };
  'state.snapshot': StateSnapshot;
  'state.ack': { ok: true };
  error: { code: string; message: string };
}

/** Discriminated union of all wire messages. */
export type DevToolsEvent = {
  [K in DevToolsEventName]: DevToolsMessage<DevToolsEventMap[K]>;
}[DevToolsEventName];

/** Metadata every NestJS application reports when it connects. */
export interface ProjectInfo {
  projectId: string;
  projectName: string;
  environment: string;
  hostname: string;
  port: number | null;
  pid: number;
  runtime: string;
  runtimeVersion: string;
  nodeVersion: string;
  nestjsVersion: string | null;
  sdkVersion: string;
}

/** One timeline entry of a request (guard, interceptor, service call...). */
export interface TimelineSpan {
  /** Logical layer, e.g. 'middleware' | 'guard' | 'interceptor' | 'pipe' | 'controller' | 'service' | 'database' | 'response'. */
  layer: string;
  /** Human label, e.g. 'JwtAuthGuard' or 'SELECT users'. */
  label: string;
  /** ms */
  duration: number;
  startedAt: number;
  status?: 'ok' | 'error';
  detail?: string;
  /** Source location when available (file, line, column, function). */
  source?: SourceLocation;
}

/** Emitted the moment a request enters the SDK. */
export interface RequestStartedPayload {
  requestId: string;
  projectId: string;
  method: string;
  url: string;
  route?: string;
  httpVersion?: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  params?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  startedAt: number;
}

/** Emitted when the response finishes. */
export interface RequestCompletedPayload {
  requestId: string;
  projectId: string;
  method: string;
  url: string;
  route?: string;
  statusCode: number;
  duration: number;
  startedAt: number;
  timeline: TimelineSpan[];
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  responsePreview?: string;
  responseBody?: unknown;
  requestBody?: unknown;
  errored: boolean;
}

/** A captured console or logger entry. */
export interface LogPayload {
  requestId?: string;
  projectId: string;
  level: LogLevel;
  message: string;
  arguments?: unknown[];
  stack?: string;
  source?: SourceLocation;
  context?: string;
  processId: number;
  timestamp: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'verbose';

/** File/line/column triple resolved from source maps when available. */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  /** Absolute path when resolvable on the host machine. */
  absolutePath?: string;
  /** function name if the stack exposed one */
  function?: string;
}

/** A captured exception with source mapping. */
export interface ErrorPayload {
  requestId?: string;
  projectId: string;
  name: string;
  message: string;
  stack?: string;
  source?: SourceLocation;
  /** stable hash for grouping identical errors */
  fingerprint: string;
  context?: string;
  request?: { method: string; url: string; statusCode?: number };
  controller?: string;
  service?: string;
  timestamp: number;
  /** server-side occurrence count for grouped errors */
  occurrences?: number;
}

/** A captured database query. */
export interface QueryPayload {
  requestId?: string;
  projectId: string;
  provider: 'prisma' | 'typeorm' | 'sequelize' | 'mikroorm' | 'other';
  sql: string;
  duration: number;
  database?: string;
  parameters?: unknown[];
  timestamp: number;
}

/** Gateway-level connection snapshot. */
export interface GatewayConnectionPayload {
  projectId: string;
  gateway: string;
  namespace: string;
  connections: number;
  timestamp: number;
}

/** Individual gateway event flow. */
export interface GatewayMessagePayload {
  projectId: string;
  gateway: string;
  event: string;
  direction: 'received' | 'sent';
  payloadSize: number;
  error?: string;
  duration?: number;
  requestId?: string;
  timestamp: number;
}

/** Point-in-time process metrics. */
export interface PerformanceSnapshot {
  projectId: string;
  timestamp: number;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  eventLoopLagMs: number;
  activeRequests: number;
  requestsPerSecond: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorsPerSecond: number;
  /** true when the process reports memory pressure */
  memoryPressure?: boolean;
}

/** Static description of the NestJS application graph. */
export interface AppSnapshot {
  projectId: string;
  projectName: string;
  modules: AppModuleNode[];
  nestjsVersion: string | null;
  capturedAt: number;
}

/** A module and its members in the application graph. */
export interface AppModuleNode {
  name: string;
  imports: string[];
  controllers: AppMemberNode[];
  providers: AppMemberNode[];
  exports: string[];
}

/** A member (controller/provider/guard/pipe/...) inside a module. */
export interface AppMemberNode {
  name: string;
  type: 'controller' | 'provider' | 'guard' | 'interceptor' | 'pipe' | 'filter' | 'gateway';
  routes?: string[];
}

/** What a dashboard/control client announces when it connects. */
export interface ClientHello {
  kind: 'dashboard' | 'cli' | 'other';
  name?: string;
  version?: string;
}

/** Full server state handed to newly connected dashboards. */
export interface StateSnapshot {
  projects: ProjectInfo[];
  requests: RequestCompletedPayload[];
  logs: LogPayload[];
  errors: ErrorPayload[];
  queries: QueryPayload[];
  websocketConnections: GatewayConnectionPayload[];
  websocketMessages: GatewayMessagePayload[];
  performance: Record<string, PerformanceSnapshot>;
  apps: Record<string, AppSnapshot>;
}
