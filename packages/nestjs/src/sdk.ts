import { hostname } from 'os';
import { devtools as coreDevtools, resolveConfig } from '@angelitosystems/devtools-core';
import type { DevToolsUserConfig } from '@angelitosystems/devtools-core';
import type { ProjectInfo } from '@angelitosystems/devtools-protocol';
import type { INestApplication } from '@nestjs/common';

import { HttpInstrumentation } from './instrumentation/http';
import { ConsoleInstrumentation } from './instrumentation/console';
import { ExceptionsInstrumentation, captureError } from './instrumentation/exceptions';
import { PerformanceInstrumentation } from './instrumentation/performance';
import { AppExplorer } from './instrumentation/app-explorer';
import { WebsocketInstrumentation } from './instrumentation/websockets';
import { DatabaseInstrumentation } from './instrumentation/database';
import { detectNestJsVersion } from './detect';
import { SDK_VERSION } from './version';

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
  static init(app: INestApplication, userConfig?: DevToolsUserConfig): InitResult {
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
    coreDevtools.initialize({ config, projectInfo, registerCleanup });

    const adapter = app.getHttpAdapter();
    const httpReady = Boolean(adapter && adapter.getType() === 'http');

    // ---- HTTP instrumentation -------------------------------------------
    const http = new HttpInstrumentation({ config, projectInfo });
    http.attach(app);

    // ---- console + global errors ----------------------------------------
    registerCleanup(new ConsoleInstrumentation({ config, projectInfo }).attach());
    registerCleanup(ExceptionsInstrumentation.attach({ config, projectInfo }));

    // ---- performance sampling -------------------------------------------
    registerCleanup(new PerformanceInstrumentation({ config, projectInfo }).attach());

    // ---- application graph ----------------------------------------------
    registerCleanup(new AppExplorer({ config, projectInfo }).attach(app));

    // ---- websockets + database (best effort) ----------------------------
    if (config.capture.websockets) {
      registerCleanup(new WebsocketInstrumentation({ config, projectInfo }).attach());
    }
    if (config.capture.database) {
      registerCleanup(new DatabaseInstrumentation({ config, projectInfo }).attach());
    }

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
}

/** Convenience functional alias: devtools.init(app). */
export const devtools = {
  init: NestDevTools.init.bind(NestDevTools),
  destroy: NestDevTools.destroy.bind(NestDevTools),
  isActive: NestDevTools.isActive.bind(NestDevTools),
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

export { captureError };
