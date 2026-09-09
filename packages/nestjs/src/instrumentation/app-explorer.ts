import type { AppModuleNode, AppMemberNode, AppSnapshot, ProjectInfo } from '@angelitosystems/devtools-protocol';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';
import type { INestApplication } from '@nestjs/common';

import { emit } from '../emitter';

interface ContainerNode {
  id: string;
  name?: string;
  metatype?: Function;
  instance?: object;
  subtype?: 'httpController' | 'gateway';
}

/**
 * Explore the Nest container to build the module graph (modules, controllers,
 * providers, guards, pipes...). Best effort: any failure keeps the app safe.
 */
export class AppExplorer {
  constructor(private readonly ctx: { config: DevToolsConfig; projectInfo: ProjectInfo }) {}

  /** Walk the container and emit app.snapshot. Returns a no-op cleanup. */
  attach(app: INestApplication): () => void {
    try {
      const snapshot = this.buildSnapshot(app);
      emit('app.snapshot', snapshot);
    } catch {
      /* best effort */
    }
    return () => {};
  }

  private buildSnapshot(app: INestApplication): AppSnapshot {
    const internal = (app as unknown as { container?: unknown }).container as
      | { getModules?: () => Map<string, ContainerNode> }
      | undefined;

    const modules: AppModuleNode[] = [];
    const modulesMap = internal?.getModules?.();
    if (modulesMap) {
      for (const [id, node] of modulesMap) {
        const moduleName = node.metatype?.name ?? String(id);
        const members = this.extractMembers(node);
        modules.push({
          name: moduleName,
          imports: [],
          controllers: members.controllers,
          providers: members.providers,
          exports: [],
        });
      }
    }

    return {
      projectId: this.ctx.projectInfo.projectId,
      projectName: this.ctx.projectInfo.projectName,
      modules,
      nestjsVersion: this.ctx.projectInfo.nestjsVersion,
      capturedAt: Date.now(),
    };
  }

  private extractMembers(node: ContainerNode): { controllers: AppMemberNode[]; providers: AppMemberNode[] } {
    const controllers: AppMemberNode[] = [];
    const providers: AppMemberNode[] = [];

    const providersMap = (node as unknown as { providers?: Map<string, unknown> }).providers;
    if (providersMap instanceof Map) {
      for (const [id, wrapper] of providersMap) {
        const member = this.memberFromWrapper(id, wrapper);
        if (!member) continue;
        if (wrapper && (wrapper as { subtype?: string }).subtype === 'httpController') {
          controllers.push(member);
        } else {
          providers.push(member);
        }
      }
    }

    return { controllers, providers };
  }

  private memberFromWrapper(id: string, wrapper: unknown): AppMemberNode | null {
    const w = wrapper as { name?: string; metatype?: Function; subtype?: string; instance?: Record<string, unknown> } | null;
    const name = w?.metatype?.name ?? (typeof id === 'string' ? id.replace(/^[A-Z_0-9]+:/, '') : 'unknown');
    const type = classify(name, w?.instance);
    return { name, type };
  }
}

/** Heuristic classification of providers into guards/interceptors/pipes/filters. */
function classify(name: string, instance?: Record<string, unknown>): AppMemberNode['type'] {
  if (name.endsWith('Gateway')) return 'gateway';
  if (name.endsWith('Guard')) return 'guard';
  if (name.endsWith('Interceptor')) return 'interceptor';
  if (name.endsWith('Pipe')) return 'pipe';
  if (name.endsWith('Filter')) return 'filter';
  if (instance && typeof instance.canActivate === 'function') return 'guard';
  if (instance && typeof instance.intercept === 'function') return 'interceptor';
  if (instance && typeof instance.transform === 'function') return 'pipe';
  if (instance && typeof instance.catch === 'function') return 'filter';
  return 'provider';
}
