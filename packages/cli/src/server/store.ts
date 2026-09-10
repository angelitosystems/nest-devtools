import type {
  AppSnapshot,
  DevToolsMessage,
  ErrorPayload,
  GatewayConnectionPayload,
  GatewayMessagePayload,
  LogPayload,
  PerformanceSnapshot,
  ProjectInfo,
  QueryPayload,
  RequestCompletedPayload,
  StateSnapshot,
} from '@angelitosystems/devtools-protocol';
import type { ProjectEntry } from './types';
import type { ServerStatus } from './types';

/** Capacity limits (memory guardrails). */
export const LIMITS = {
  requests: 1000,
  logs: 5000,
  errors: 1000,
  queries: 2000,
  websocketEvents: 2000,
  performancePoints: 240,
} as const;

/** In-memory state of everything the dashboard renders. */
export class DashboardStore {
  private readonly projects = new Map<string, ProjectEntry>();
  private readonly requests = new Map<string, RequestCompletedPayload[]>();
  private readonly logs = new Map<string, LogPayload[]>();
  private readonly errors = new Map<string, ErrorPayload[]>();
  private readonly queries = new Map<string, QueryPayload[]>();
  private readonly websocketConnections = new Map<string, GatewayConnectionPayload[]>();
  private readonly websocketMessages = new Map<string, GatewayMessagePayload[]>();
  private readonly performance = new Map<string, PerformanceSnapshot[]>();
  private readonly apps = new Map<string, AppSnapshot>();

  private totalRequests = 0;
  private totalLogs = 0;
  private totalErrors = 0;
  private lastErrorByFingerprint = new Map<string, { projectId: string; payload: ErrorPayload; count: number; lastAt: number }>();

  /** Apply an incoming event from a project connection. */
  apply(message: DevToolsMessage, projectId: string): void {
    switch (message.event) {
      case 'project.connected':
        this.upsertProject(message.payload as ProjectInfo);
        break;
      case 'request.completed':
        this.totalRequests += 1;
        this.push(this.requests, projectId, message.payload as RequestCompletedPayload, LIMITS.requests);
        break;
      case 'log.created':
        this.totalLogs += 1;
        this.push(this.logs, projectId, message.payload as LogPayload, LIMITS.logs);
        break;
      case 'error.created':
        this.totalErrors += 1;
        this.trackError(projectId, message.payload as ErrorPayload);
        this.push(this.errors, projectId, message.payload as ErrorPayload, LIMITS.errors);
        break;
      case 'query.executed':
        this.push(this.queries, projectId, message.payload as QueryPayload, LIMITS.queries);
        break;
      case 'websocket.connected':
        this.push(this.websocketConnections, projectId, message.payload as GatewayConnectionPayload, LIMITS.websocketEvents);
        break;
      case 'websocket.message':
        this.push(this.websocketMessages, projectId, message.payload as GatewayMessagePayload, LIMITS.websocketEvents);
        break;
      case 'performance.updated': {
        const snapshot = message.payload as PerformanceSnapshot;
        this.push(this.performance, projectId, snapshot, LIMITS.performancePoints);
        break;
      }
      case 'app.snapshot':
        this.apps.set(projectId, message.payload as AppSnapshot);
        break;
      default:
        break;
    }
  }

  /** Register/refresh a project connection. */
  upsertProject(info: ProjectInfo): void {
    const existing = this.projects.get(info.projectId);
    this.projects.set(info.projectId, {
      info,
      connected: true,
      lastSeenAt: Date.now(),
      connectionCount: (existing?.connectionCount ?? 0) + 1,
    });
  }

  /** Mark a project as seen by the dashboard (avoids re-listing stale placeholders). */
  markProjectSeen(projectId: string): void {
    const existing = this.projects.get(projectId);
    if (existing) {
      existing.connected = true;
      existing.lastSeenAt = Date.now();
    }
  }

  /** Mark a project disconnected. */
  disconnectProject(projectId: string, reason?: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.connected = false;
      project.lastSeenAt = Date.now();
    }
    void reason;
  }

  /** Whether a project is currently considered connected. */
  isProjectConnected(projectId: string): boolean {
    return this.projects.get(projectId)?.connected ?? false;
  }

  private trackError(projectId: string, payload: ErrorPayload): void {
    const existing = this.lastErrorByFingerprint.get(payload.fingerprint);
    if (existing) {
      existing.count += 1;
      existing.lastAt = payload.timestamp;
    } else {
      this.lastErrorByFingerprint.set(payload.fingerprint, { projectId, payload, count: 1, lastAt: payload.timestamp });
    }
  }

  /** Occurrence counts per error fingerprint (grouped errors view). */
  errorGroups(): Array<{ projectId: string; fingerprint: string; count: number; lastAt: number; sample: ErrorPayload }> {
    return [...this.lastErrorByFingerprint.entries()].map(([fingerprint, entry]) => ({
      projectId: entry.projectId,
      fingerprint,
      count: entry.count,
      lastAt: entry.lastAt,
      sample: entry.payload,
    }));
  }

  private push<T>(map: Map<string, T[]>, projectId: string, item: T, limit: number): void {
    const list = map.get(projectId) ?? [];
    list.push(item);
    if (list.length > limit) list.splice(0, list.length - limit);
    map.set(projectId, list);
  }

  /** Everything a dashboard needs on connect. */
  snapshot(): StateSnapshot {
    return {
      projects: [...this.projects.values()].map((entry) => entry.info),
      requests: flat(this.requests).slice(-LIMITS.requests),
      logs: flat(this.logs).slice(-LIMITS.logs),
      errors: flat(this.errors).slice(-LIMITS.errors),
      queries: flat(this.queries).slice(-LIMITS.queries),
      websocketConnections: flat(this.websocketConnections).slice(-LIMITS.websocketEvents),
      websocketMessages: flat(this.websocketMessages).slice(-LIMITS.websocketEvents),
      performance: Object.fromEntries(
        [...this.performance.entries()].map(([projectId, points]) => [projectId, points[points.length - 1]]),
      ),
      apps: Object.fromEntries(this.apps),
    };
  }

  /** Clear captured state. */
  clear(scope: 'logs' | 'requests' | 'errors' | 'queries' | 'all'): void {
    if (scope === 'all' || scope === 'logs') this.logs.clear();
    if (scope === 'all' || scope === 'requests') this.requests.clear();
    if (scope === 'all' || scope === 'errors') this.errors.clear();
    if (scope === 'all' || scope === 'queries') this.queries.clear();
    if (scope === 'all') {
      this.totalRequests = 0;
      this.totalLogs = 0;
      this.totalErrors = 0;
    }
  }

  /** Full status snapshot for CLI / doctor. */
  statusSnapshot(other?: { dashboardClients?: number; projects?: ProjectEntry[] }): ServerStatus {
    return {
      running: true,
      httpPort: 4317,
      wsPort: 4318,
      startedAt: Date.now(),
      uptimeMs: Date.now(),
      projects: other?.projects ?? this.listProjects(),
      dashboardClients: other?.dashboardClients ?? 0,
      totalRequests: this.totalRequests,
      totalLogs: this.totalLogs,
      totalErrors: this.totalErrors,
    };
  }


  /** Aggregated counters for CLI status. */
  counters(): { totalRequests: number; totalLogs: number; totalErrors: number } {
    return { totalRequests: this.totalRequests, totalLogs: this.totalLogs, totalErrors: this.totalErrors };
  }

  /** Reset counters (used for CLI `state.clear` integration tests). */
  resetCounters(): void {
    this.totalRequests = 0;
    this.totalLogs = 0;
    this.totalErrors = 0;
  }

  /** Projects list with connection status (only connected projects visible to CLI). */
  listProjects(): ProjectEntry[] {
    return [...this.projects.values()].filter((entry) => entry.connected).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  /** Projects currently connected (for UI / dashboard APIs). */
  connectedProjects(): ProjectEntry[] {
    return this.listProjects();
  }

  /** Latest performance snapshot for a project. */
  latestPerformance(projectId: string): PerformanceSnapshot | undefined {
    const points = this.performance.get(projectId);
    return points?.[points.length - 1];
  }

  /** Recent performance points for a project (charts). */
  performancePoints(projectId: string, count = 60): PerformanceSnapshot[] {
    const points = this.performance.get(projectId);
    return points ? points.slice(-count) : [];
  }

  /** All apps snapshots. */
  appsMap(): Map<string, AppSnapshot> {
    return this.apps;
  }
}

function flat<T>(map: Map<string, T[]>): T[] {
  const out: T[] = [];
  for (const list of map.values()) out.push(...list);
  return out.sort((a, b) => extractTs(a) - extractTs(b));
}

function extractTs(item: unknown): number {
  return (item as { timestamp?: number; startedAt?: number }).timestamp ?? (item as { startedAt?: number }).startedAt ?? 0;
}
