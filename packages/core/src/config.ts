import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';
import type { OpenTelemetryOptions } from './opentelemetry';

/** Capture toggles for the SDK. */
export interface CaptureOptions {
  requests: boolean;
  logs: boolean;
  errors: boolean;
  database: boolean;
  websockets: boolean;
  performance: boolean;
}

/** Full SDK configuration. */
export interface DevToolsConfig {
  /** Master switch. Defaults to NODE_ENV !== 'production'. */
  enabled: boolean;
  /** DevTools server WebSocket endpoint. */
  server: string;
  /** Project display name (defaults to package.json name or directory name). */
  project?: string;
  /** Stable project id (resolved from `project` when omitted). */
  projectId: string;
  /** 'development' | 'production' | custom. */
  environment: string;
  /** Extra keys to redact. */
  redact: string[];
  /** Keys that must never be redacted. */
  allow: string[];
  capture: CaptureOptions;
  /** Sampling rate 0..1 for high-volume events (requests/logs). */
  sampling: number;
  /** Max buffered messages when offline. */
  bufferSize: number;
  /** Flush interval in ms. */
  flushInterval: number;
  /** Max events batched into one frame. */
  batchMax: number;
  /** Max serialized payload bytes per message. */
  maxPayloadBytes: number;
  /** Performance sampling interval in ms. */
  performanceInterval: number;
  /** Auth token forwarded as ?token= when connecting. */
  token?: string;
  /** Optional OTLP/HTTP export; disabled unless an endpoint is provided. */
  openTelemetry?: OpenTelemetryOptions;
}

/** Partial user-facing configuration. */
export type DevToolsUserConfig = Partial<Omit<DevToolsConfig, 'capture'>> & {
  capture?: Partial<CaptureOptions>;
};

export const DEFAULT_WS_URL = 'ws://localhost:4318';

/** Resolve configuration by merging defaults, env vars and user options. */
export function resolveConfig(user?: DevToolsUserConfig): DevToolsConfig {
  const env = safeEnv();
  const projectName = user?.project ?? env['NEST_DEVTOOLS_PROJECT'] ?? guessProjectName();

  return {
    enabled: user?.enabled ?? envBool('NEST_DEVTOOLS_ENABLED', env['NODE_ENV'] !== 'production'),
    server: user?.server ?? env['NEST_DEVTOOLS_URL'] ?? DEFAULT_WS_URL,
    project: projectName,
    projectId: user?.projectId ?? env['NEST_DEVTOOLS_PROJECT_ID'] ?? slugify(projectName ?? 'nestjs-app'),
    environment: user?.environment ?? env['NEST_DEVTOOLS_ENV'] ?? env['NODE_ENV'] ?? 'development',
    redact: user?.redact ?? [],
    allow: user?.allow ?? [],
    capture: {
      requests: user?.capture?.requests ?? true,
      logs: user?.capture?.logs ?? true,
      errors: user?.capture?.errors ?? true,
      database: user?.capture?.database ?? true,
      websockets: user?.capture?.websockets ?? true,
      performance: user?.capture?.performance ?? true,
    },
    sampling: user?.sampling ?? numberEnv('NEST_DEVTOOLS_SAMPLING', 1),
    bufferSize: user?.bufferSize ?? 5000,
    flushInterval: user?.flushInterval ?? 150,
    batchMax: user?.batchMax ?? 50,
    maxPayloadBytes: user?.maxPayloadBytes ?? 256 * 1024,
    performanceInterval: user?.performanceInterval ?? 5000,
    token: user?.token ?? env['NEST_DEVTOOLS_TOKEN'],
      openTelemetry: user?.openTelemetry,
  };
}

function safeEnv(): Record<string, string | undefined> {
  try {
    return (process.env ?? {}) as Record<string, string | undefined>;
  } catch {
    return {};
  }
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = safeEnv()[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function numberEnv(name: string, fallback: number): number {
  const raw = safeEnv()[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function guessProjectName(): string | undefined {
  try {
    const cwd = process.cwd();
    const pkgPath = resolve(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name && !pkg.name.startsWith('@angelitosystems/')) return pkg.name;
    }
    return basename(cwd);
  } catch {
    return undefined;
  }
}

/** URL/url-path safe project slug. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/@[^/]+\//g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'nestjs-app'
  );
}
