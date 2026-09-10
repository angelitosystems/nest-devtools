import type { INestApplication } from '@nestjs/common';
import { Redactor } from '@angelitosystems/devtools-protocol';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';
import type { DevToolsEventMap, DevToolsEventName, ProjectInfo } from '@angelitosystems/devtools-protocol';
import { emit } from './emitter';

export interface PluginContext {
  readonly config: DevToolsConfig;
  readonly project: ProjectInfo;
  readonly redactor: Redactor;
  emit<K extends DevToolsEventName>(event: K, payload: DevToolsEventMap[K]): void;
  custom(name: string, data?: unknown): void;
}

export interface DevToolsPlugin {
  readonly name: string;
  onInit?(context: PluginContext): void | Promise<void>;
  onAttach?(app: INestApplication, context: PluginContext): void | (() => void) | Promise<void | (() => void)>;
  onDispose?(): void | Promise<void>;
}

/** Runs third-party instrumentation without allowing it to affect the app. */
export class PluginManager {
  private readonly cleanups: Array<() => void> = [];
  private readonly initialized: DevToolsPlugin[] = [];

  constructor(private readonly plugins: DevToolsPlugin[]) {}

  attach(app: INestApplication, config: DevToolsConfig, project: ProjectInfo): () => void {
    const redactor = new Redactor({ redact: config.redact, allow: config.allow, maxBytes: config.maxPayloadBytes });
    const context: PluginContext = {
      config,
      project,
      redactor,
      emit: (event, payload) => {
        try { emit(event, redactor.redact(payload) as DevToolsEventMap[typeof event]); } catch { /* plugin isolation */ }
      },
      custom: (name, data) => {
        try {
          emit('plugin.event', {
            projectId: project.projectId,
            plugin: 'custom',
            name,
            data: redactor.redact(data),
            timestamp: Date.now(),
          });
        } catch { /* plugin isolation */ }
      },
    };

    for (const plugin of this.plugins) {
      if (!plugin || !plugin.name) continue;
      this.initialized.push(plugin);
      this.run(plugin.name, () => plugin.onInit?.(context));
      this.run(plugin.name, async () => {
        const cleanup = await plugin.onAttach?.(app, context);
        if (typeof cleanup === 'function') this.cleanups.push(cleanup);
      });
    }

    return () => {
      for (const cleanup of this.cleanups.splice(0)) {
        try { cleanup(); } catch { /* plugin isolation */ }
      }
      for (const plugin of this.initialized.splice(0)) this.run(plugin.name, () => plugin.onDispose?.());
    };
  }

  private run(name: string, operation: () => void | Promise<void>): void {
    try {
      const result = operation();
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch((error) => this.reportFailure(name, error));
      }
    } catch (error) {
      this.reportFailure(name, error);
    }
  }

  private reportFailure(name: string, error: unknown): void {
    try {
      emit('log.created', {
        projectId: 'plugin-system',
        level: 'error',
        message: `DevTools plugin ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        processId: process.pid,
        timestamp: Date.now(),
        context: 'plugin',
      });
    } catch { /* plugin isolation */ }
  }
}
