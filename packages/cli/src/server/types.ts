export interface ProjectEntry {
  info: {
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
  };
  connected: boolean;
  lastSeenAt: number;
  connectionCount: number;
}

export type ServerStatus = {
  running: boolean;
  httpPort: number;
  wsPort: number;
  startedAt: number | null;
  uptimeMs: number;
  projects: ProjectEntry[];
  dashboardClients: number;
  totalRequests: number;
  totalLogs: number;
  totalErrors: number;
};
