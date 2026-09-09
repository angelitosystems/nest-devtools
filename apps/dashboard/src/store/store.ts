import { useEffect, useRef, useState } from 'react';
import type {
  AppSnapshot,
  DevToolsMessage,
  ErrorPayload,
  LogPayload,
  PerformanceSnapshot,
  ProjectInfo,
  RequestCompletedPayload,
} from '@angelitosystems/devtools-protocol';
import { DevToolsConnection, resolveWsUrl } from './connection';

const CAPS = {
  requests: 500,
  logs: 2000,
  errors: 500,
};

/** Reactive view of the live DevTools stream. */
export interface DevToolsState {
  connectionState: 'connecting' | 'open' | 'closed';
  projects: ProjectInfo[];
  requests: RequestCompletedPayload[];
  logs: LogPayload[];
  errors: ErrorPayload[];
  performance: Record<string, PerformanceSnapshot>;
  apps: Record<string, AppSnapshot>;
  errorGroups: Array<{ fingerprint: string; count: number; sample: ErrorPayload; projectId: string }>;
  clear: (scope: 'logs' | 'requests' | 'errors' | 'all') => void;
}

/** Maintain and expose the live DevTools state as React state. */
export function useDevToolsStore(): DevToolsState {
  const ref = useRef<{
    connection: DevToolsConnection | null;
    requests: RequestCompletedPayload[];
    logs: LogPayload[];
    errors: ErrorPayload[];
    errorCounts: Map<string, { count: number; sample: ErrorPayload; projectId: string }>;
  }>({ connection: null, requests: [], logs: [], errors: [], errorCounts: new Map() });

  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [requests, setRequests] = useState<RequestCompletedPayload[]>([]);
  const [logs, setLogs] = useState<LogPayload[]>([]);
  const [errors, setErrors] = useState<ErrorPayload[]>([]);
  const [performance, setPerformance] = useState<Record<string, PerformanceSnapshot>>({});
  const [apps, setApps] = useState<Record<string, AppSnapshot>>({});
  const [errorGroups, setErrorGroups] = useState<DevToolsState['errorGroups']>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const cache = ref.current;
    const connection = new DevToolsConnection(resolveWsUrl());
    cache.connection = connection;

    const offState = connection.onStateChange(setConnectionState);

    const offMessages = connection.onMessage((message) => {
      switch (message.event) {
        case 'state.snapshot': {
          const snapshot = message.payload as {
            projects: ProjectInfo[];
            requests: RequestCompletedPayload[];
            logs: LogPayload[];
            errors: ErrorPayload[];
            performance: Record<string, PerformanceSnapshot>;
            apps: Record<string, AppSnapshot>;
          };
          cache.requests = [...snapshot.requests];
          cache.logs = [...snapshot.logs];
          cache.errors = [...snapshot.errors];
          setRequests(cache.requests);
          setLogs(cache.logs);
          setErrors(cache.errors);
          setProjects(snapshot.projects ?? []);
          setPerformance(snapshot.performance ?? {});
          setApps(snapshot.apps ?? {});
          rebuildErrorGroups(cache, setErrorGroups);
          break;
        }
        case 'project.connected': {
          const info = message.payload as ProjectInfo;
          setProjects((prev) => {
            const next = prev.filter((p) => p.projectId !== info.projectId);
            next.push(info);
            return next;
          });
          setApps((prev) => ({ ...prev, [info.projectId]: (prev[info.projectId] ?? {}) }));
          break;
        }
        case 'project.disconnected': {
          const payload = message.payload as { projectId: string; reason?: string };
          setProjects((prev) => prev.filter((p) => p.projectId !== payload.projectId));
          setApps((prev) => {
            const next = { ...prev };
            delete next[payload.projectId];
            return next;
          });
          break;
        }
        case 'request.completed': {
          const payload = message.payload as RequestCompletedPayload;
          cache.requests.push(payload);
          if (cache.requests.length > CAPS.requests) cache.requests.shift();
          setRequests([...cache.requests]);
          break;
        }
        case 'log.created': {
          const payload = message.payload as LogPayload;
          cache.logs.push(payload);
          if (cache.logs.length > CAPS.logs) cache.logs.shift();
          setLogs([...cache.logs]);
          break;
        }
        case 'error.created': {
          const payload = message.payload as ErrorPayload;
          cache.errors.push(payload);
          if (cache.errors.length > CAPS.errors) cache.errors.shift();
          setErrors([...cache.errors]);
          const group = cache.errorCounts.get(payload.fingerprint);
          cache.errorCounts.set(payload.fingerprint, {
            count: (group?.count ?? 0) + 1,
            sample: payload,
            projectId: payload.projectId,
          });
          rebuildErrorGroups(cache, setErrorGroups);
          break;
        }
        case 'performance.updated': {
          const payload = message.payload as PerformanceSnapshot;
          setPerformance((prev) => ({ ...prev, [payload.projectId]: payload }));
          break;
        }
        case 'app.snapshot': {
          const payload = message.payload as AppSnapshot;
          setApps((prev) => ({ ...prev, [payload.projectId]: payload }));
          break;
        }
        case 'project.disconnected': {
          const payload = message.payload as { projectId: string };
          setProjects((prev) => prev.filter((p) => p.projectId !== payload.projectId));
          break;
        }
        default:
          break;
      }
      setTick((t) => t + 1);
    });

    connection.start();

    return () => {
      offMessages();
      offState();
      connection.stop();
    };
  }, []);

  const clear = (scope: 'logs' | 'requests' | 'errors' | 'all') => {
    ref.current.connection?.send('state.clear', { scope });
  };

  void tick; // tick forces rerenders alongside state setters
  return { connectionState, projects, requests, logs, errors, performance, apps, errorGroups, clear };
}

function rebuildErrorGroups(
  cache: { errorCounts: Map<string, { count: number; sample: ErrorPayload; projectId: string }> },
  setErrorGroups: (groups: DevToolsState['errorGroups']) => void,
): void {
  setErrorGroups(
    [...cache.errorCounts.entries()]
      .map(([fingerprint, value]) => ({ fingerprint, ...value }))
      .sort((a, b) => b.count - a.count),
  );
}

export type { DevToolsMessage };
