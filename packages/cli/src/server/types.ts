import type {
  AppSnapshot,
  ErrorPayload,
  LogPayload,
  PerformanceSnapshot,
  ProjectInfo,
  QueryPayload,
  RequestCompletedPayload,
} from '@angelitosystems/devtools-protocol';

/** A connected or recently seen project. */
export interface ProjectEntry {
  info: ProjectInfo;
  connected: boolean;
  lastSeenAt: number;
  connectionCount: number;
}

/** Runtime status of the DevTools server. */
export interface ServerStatus {
  running: boolean;
  httpPort: number;
  wsPort: number;
  startedAt: number | null;
  uptimeMs: number;
  projects: ProjectEntry[];
  totalRequests: number;
  totalLogs: number;
  totalErrors: number;
  dashboardClients: number;
}
