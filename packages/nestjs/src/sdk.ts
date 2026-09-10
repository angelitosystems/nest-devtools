import { hostname } from 'os';
import { devtools as coreDevtools, resolveConfig } from '@angelitosystems/devtools-core';
import type { DevToolsUserConfig } from '@angelitosystems/devtools-core';
import type { ProjectInfo } from '@angelitosystems/devtools-protocol';
import type { INestApplication } from '@nestjs/common';

import { HttpInstrumentation } from './instrumentation/http';
import { ConsoleInstrumentation } from './instrumentation/console';
import { LoggerInstrumentation } from './instrumentation/nest-logger';
import { ExceptionsInstrumentation, captureError } from './instrumentation/exceptions';
import { PerformanceInstrumentation } from './instrumentation/performance';
import { AppExplorer } from './instrumentation/app-explorer';
import { WebsocketInstrumentation } from './instrumentation/websockets';
import { DatabaseInstrumentation } from './instrumentation/database';
import { QueueEventInstrumentation } from './instrumentation/queue';
import { detectNestJsVersion } from './detect';
import { SDK_VERSION } from './version';
import { printStartupBanner, printConnectionStatus } from './banner';
import { PluginManager } from './plugins';
import type { DevToolsPlugin } from './plugins';
import type { ProfileKind, ProfileResult } from '@angelitosystems/devtools-core';

/** Result of calling NestDevTools.init(). */
export interface InitResult {
  /** True when instrumentation is live. */
  enabled: boolean;
  /** Reason when partially or fully disabled. */
  reason?: 'disabled-by-config' | 'already-initialized' | 'no-http-adapter';
  projectId: string;
  projectName: string;
  server: string;
}

export type NestDevToolsOptions = DevToolsUserConfig & { plugins?: DevToolsPlugin[] };

/**
 * Main entry point: `NestDevTools.init(app, config?)`.
 *
 * Never throws, never blocks startup, and disables itself in production
 * unless explicitly enabled.
 */
export class NestDevTools {
  private static readonly cleanups: Array<() => void> = [];
  private static initialized = false;

  /** Initialize DevTools for a NestJS application. One active instance per process. */
  static init(app: INestApplication, userConfig?: NestDevToolsOptions): InitResult {
    const config = resolveConfig(userConfig);
    const disabled: InitResult = {
      enabled: false,
      reason: 'disabled-by-config',
      projectId: config.projectId,
      projectName: config.project ?? config.projectId,
      server: config.server,
    };

    if (this.initialized) return { ...disabled, reason: 'already-initialized' };
    if (!config.enabled) return disabled; // zero side effects: no patching, no sockets, no timers

    this.initialized = true;
    const registerCleanup = (fn: () => void) => this.cleanups.push(fn);

    const projectInfo: ProjectInfo = {
      projectId: config.projectId,
      projectName: config.project ?? config.projectId,
      environment: config.environment,
      hostname: safeHostname(),
      port: null,
      pid: process.pid,
      runtime: detectRuntime(),
      runtimeVersion: detectRuntimeVersion(),
      nodeVersion: process.version,
      nestjsVersion: detectNestJsVersion(),
      sdkVersion: SDK_VERSION,
    };

    // transport is fully async: a missing server never affects startup
    let hasWarnedOffline = false;
    coreDevtools.initialize({
      config,
      projectInfo,
      registerCleanup,
      onStateChange: (state: any) => {
        if (state === 'open') {
          printConnectionStatus('open', dashboardUrl(config.server));
        } else if (state === 'retrying' && !hasWarnedOffline) {
          hasWarnedOffline = true;
          printConnectionStatus('offline', dashboardUrl(config.server));
        }
      },
    } as any);

    if (userConfig?.plugins && userConfig.plugins.length > 0) {
      registerCleanup(new PluginManager(userConfig.plugins).attach(app, config, projectInfo));
    }

    const adapter = app.getHttpAdapter();
    const httpReady = Boolean(adapter && ['http', 'express'].includes(adapter.getType()));

    // ---- HTTP instrumentation -------------------------------------------
    const http = new HttpInstrumentation({ config, projectInfo });
    registerCleanup(http.attach(app));

    // ---- console + NestJS Logger + global errors ------------------------
    registerCleanup(new ConsoleInstrumentation({ config, projectInfo }).attach());
    registerCleanup(new LoggerInstrumentation({ config, projectInfo }).attach());
    registerCleanup(ExceptionsInstrumentation.attach({ config, projectInfo }));

    // ---- performance sampling -------------------------------------------
    registerCleanup(new PerformanceInstrumentation({ config, projectInfo }).attach());

    // ---- application graph ----------------------------------------------
    registerCleanup(new AppExplorer({ config, projectInfo }).attach(app));

    // ---- websockets + database + queues (best effort) ------------------
    if (config.capture.websockets) {
      registerCleanup(new WebsocketInstrumentation({ config, projectInfo, app }).attach());
    }
    if (config.capture.database) {
      registerCleanup(new DatabaseInstrumentation({ config, projectInfo, app }).attach());
    }
    registerCleanup(new QueueEventInstrumentation({ config, projectInfo }).attach());

    printStartupBanner({
      endpoint: config.server,
      dashboard: dashboardUrl(config.server),
      project: projectInfo.projectName,
    });

    return {
      enabled: true,
      projectId: config.projectId,
      projectName: projectInfo.projectName,
      server: config.server,
      ...(httpReady ? {} : { reason: 'no-http-adapter' as const }),
    };
  }

  /** Teardown everything (mostly useful in tests). */
  static destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    }
    this.initialized = false;
    coreDevtools.shutdown();
  }

  /** Whether the SDK is currently active in this process. */
  static isActive(): boolean {
    return this.initialized;
  }

  /** Start an explicit CPU or heap profile. */
  static startProfile(kind: ProfileKind): Promise<{ profileId: string; startedAt: number }> {
    return coreDevtools.startProfile(kind);
  }

  /** Stop the active profile and return its captured result. */
  static stopProfile(): Promise<ProfileResult> {
    return coreDevtools.stopProfile();
  }
}

/** Convenience functional alias: devtools.init(app). */
export const devtools = {
  init: NestDevTools.init.bind(NestDevTools),
  destroy: NestDevTools.destroy.bind(NestDevTools),
  isActive: NestDevTools.isActive.bind(NestDevTools),
  startProfile: NestDevTools.startProfile.bind(NestDevTools),
  stopProfile: NestDevTools.stopProfile.bind(NestDevTools),
};

function safeHostname(): string {
  try {
    return hostname();
  } catch {
    return 'unknown';
  }
}

function detectRuntime(): string {
  const versions = process.versions as Record<string, string | undefined>;
  if (versions['bun']) return 'bun';
  if (versions['deno']) return 'deno';
  return 'node';
}

function detectRuntimeVersion(): string {
  const versions = process.versions as Record<string, string | undefined>;
  return versions['bun'] ?? versions['deno'] ?? process.version;
}

function dashboardUrl(server: string): string {
  try {
    const url = new URL(server);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    const port = Number(url.port);
    url.port = String(Number.isFinite(port) && port > 0 ? port - 1 : 4317);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:4317';
  }
}

export { captureError };