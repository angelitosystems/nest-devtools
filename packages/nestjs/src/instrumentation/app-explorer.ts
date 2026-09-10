import type {
  AppModuleNode,
  AppMemberNode,
  AppSnapshot,
  AppGlobals,
  RouteNode,
  DtoShape,
  ProjectInfo,
} from '@angelitosystems/devtools-protocol';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';
import type { INestApplication } from '@nestjs/common';

import { createRequire } from 'module';
import { emit } from '../emitter';

// This package is published dual CJS/ESM ("type": "module" + a .cjs build).
// `require` isn't defined in the ESM build, so we build one lazily via
// createRequire — this still resolves against the HOST app's node_modules.
const safeRequire = (() => {
  try {
    return createRequire(import.meta.url);
  } catch {
    return null;
  }
})();

interface ContainerNode {
  id: string;
  name?: string;
  metatype?: Function;
  instance?: object;
  subtype?: 'httpController' | 'gateway';
  controllers?: Map<string, unknown>;
  providers?: Map<string, unknown>;
}

// Stable, long-lived NestJS metadata keys (re-implemented here so this file
// has zero runtime dependency on @nestjs/common's internal export surface).
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const GUARDS_METADATA = '__guards__';
const INTERCEPTORS_METADATA = '__interceptors__';
const PIPES_METADATA = '__pipes__';
const EXCEPTION_FILTERS_METADATA = '__exceptionFilters__';
const ROUTE_ARGS_METADATA = '__routeArguments__';

// From @nestjs/common's RouteParamtypes enum (stable since Nest 6).
const BODY_PARAM_TYPE = 3;

const HTTP_METHOD_NAMES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

/**
 * Explore the Nest container to build the module graph AND a full route
 * catalog (method, path, guards/interceptors/pipes/filters, DTO shape).
 * Best effort: any failure keeps the app safe, nothing here can throw up
 * into user code.
 */
export class AppExplorer {
  constructor(private readonly ctx: { config: DevToolsConfig; projectInfo: ProjectInfo }) {}

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

    const globals = this.extractGlobals(app);
    const modules: AppModuleNode[] = [];
    const modulesMap = internal?.getModules?.();
    if (modulesMap) {
      for (const [id, node] of modulesMap) {
        const moduleName = node.metatype?.name ?? String(id);
        const members = this.extractMembers(node, globals);
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
      globals,
    };
  }

  /** Global prefix, versioning, and APP_GUARD/APP_INTERCEPTOR/APP_FILTER/APP_PIPE providers (from AppModule's `providers` array). */
  private extractGlobals(app: INestApplication): AppGlobals {
    const result: AppGlobals = { prefix: null, versioning: null, guards: [], interceptors: [], filters: [], pipes: [] };
    try {
      // Internal but long-stable: ApplicationConfig instance Nest attaches to every app.
      const config = (app as unknown as { config?: any }).config;
      result.prefix = typeof config?.getGlobalPrefix === 'function' ? config.getGlobalPrefix() || null : null;
      const versioning = typeof config?.getVersioning === 'function' ? config.getVersioning() : null;
      if (versioning) result.versioning = { type: String(versioning.type), defaultVersion: versioning.defaultVersion };

      // Global enhancers registered via APP_GUARD / APP_INTERCEPTOR / APP_FILTER / APP_PIPE
      // show up as regular providers whose instance is the enhancer itself; we can't see the
      // DI token from the instance side, so we classify by shape (canActivate/intercept/catch/transform)
      // as a best-effort global list.
      const internal = (app as unknown as { container?: unknown }).container as
        | { getModules?: () => Map<string, ContainerNode> }
        | undefined;
      const modulesMap = internal?.getModules?.();
      if (modulesMap) {
        for (const node of modulesMap.values()) {
          const providersMap = node.providers;
          if (!(providersMap instanceof Map)) continue;
          for (const wrapper of providersMap.values()) {
            const w = wrapper as { name?: string; metatype?: Function; instance?: any } | null;
            const name = w?.metatype?.name ?? w?.name;
            if (!name || typeof name !== 'string') continue;
            const instance = w?.instance;
            if (!instance) continue;
            if (typeof instance.canActivate === 'function' && name.endsWith('Guard')) pushUnique(result.guards, name);
            else if (typeof instance.intercept === 'function' && name.endsWith('Interceptor')) pushUnique(result.interceptors, name);
            else if (typeof instance.catch === 'function' && name.endsWith('Filter')) pushUnique(result.filters, name);
            else if (typeof instance.transform === 'function' && name.endsWith('Pipe')) pushUnique(result.pipes, name);
          }
        }
      }
    } catch {
      /* best effort */
    }
    return result;
  }

  private extractMembers(node: ContainerNode, globals: AppGlobals): { controllers: AppMemberNode[]; providers: AppMemberNode[] } {
    const controllers: AppMemberNode[] = [];
    const providers: AppMemberNode[] = [];

    const controllersMap = node.controllers;
    if (controllersMap instanceof Map) {
      for (const [id, wrapper] of controllersMap) {
        const member = this.memberFromWrapper(id, wrapper, globals, 'controller');
        if (member) controllers.push(member);
      }
    }

    const providersMap = node.providers;
    if (providersMap instanceof Map) {
      for (const [id, wrapper] of providersMap) {
        const member = this.memberFromWrapper(id, wrapper, globals);
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

  private memberFromWrapper(
    id: string,
    wrapper: unknown,
    globals: AppGlobals,
    forcedType?: AppMemberNode['type'],
  ): AppMemberNode | null {
    const w = wrapper as { name?: string; metatype?: Function; subtype?: string; instance?: Record<string, unknown> } | null;
    const name = w?.metatype?.name ?? (typeof id === 'string' ? id.replace(/^[A-Z_0-9]+:/, '') : 'unknown');
    const type = forcedType ?? classify(name, w?.instance);

    if (type !== 'controller' || !w?.metatype) {
      return { name, type };
    }

    const { basePath, routes } = this.extractRoutes(w.metatype, globals);
    return {
      name,
      type,
      basePath,
      routeDetails: routes,
      routes: routes.map((r) => `${r.method} ${r.path}`), // legacy field, kept for old dashboards
    };
  }

  /** Extract every HTTP route of a controller class, with method/path/guards/interceptors/pipes/filters/dto. */
  private extractRoutes(controller: Function, globals: AppGlobals): { basePath: string; routes: RouteNode[] } {
    const routes: RouteNode[] = [];
    let basePath = '';
    try {
      const R = Reflect as any;
      basePath = normalizeSegment(R.getMetadata?.(PATH_METADATA, controller) ?? '');
      const classGuards = readMetaNames(R, GUARDS_METADATA, controller);
      const classInterceptors = readMetaNames(R, INTERCEPTORS_METADATA, controller);
      const classPipes = readMetaNames(R, PIPES_METADATA, controller);
      const classFilters = readMetaNames(R, EXCEPTION_FILTERS_METADATA, controller);

      const proto = controller.prototype;
      if (!proto) return { basePath, routes };

      const version = globals.versioning?.defaultVersion;
      const versionSegment =
        globals.versioning?.type === 'URI' && version && version !== '-1' ? `v${Array.isArray(version) ? version[0] : version}` : '';

      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue;
        const handler = (proto as any)[key];
        if (typeof handler !== 'function') continue;

        const httpMethod = R.getMetadata?.(METHOD_METADATA, handler);
        if (httpMethod === undefined) continue; // not an @Get/@Post/... handler

        const methodPath = normalizeSegment(R.getMetadata?.(PATH_METADATA, handler) ?? '');
        const fullPath = ['/', globals.prefix, versionSegment, basePath, methodPath]
          .filter((segment) => segment && segment !== '/')
          .join('/')
          .replace(/\/+/g, '/');

        const methodGuards = readMetaNames(R, GUARDS_METADATA, handler);
        const methodInterceptors = readMetaNames(R, INTERCEPTORS_METADATA, handler);
        const methodPipes = readMetaNames(R, PIPES_METADATA, handler);
        const methodFilters = readMetaNames(R, EXCEPTION_FILTERS_METADATA, handler);

        routes.push({
          method: HTTP_METHOD_NAMES[httpMethod] ?? 'GET',
          path: fullPath.startsWith('/') ? fullPath : `/${fullPath}`,
          handlerName: key,
          guards: dedupe([...classGuards, ...methodGuards]),
          interceptors: dedupe([...classInterceptors, ...methodInterceptors]),
          pipes: dedupe([...classPipes, ...methodPipes]),
          filters: dedupe([...classFilters, ...methodFilters]),
          dto: this.extractBodyDto(R, controller, proto, key),
        });
      }
    } catch {
      /* best effort */
    }
    return { basePath, routes };
  }

  /** Best-effort: find the @Body() parameter's class and describe its fields via class-validator, if present. */
  private extractBodyDto(R: any, controller: Function, proto: object, methodName: string): DtoShape | null {
    try {
      const paramTypes: Function[] = R.getMetadata?.('design:paramtypes', proto, methodName) ?? [];
      const routeArgs = R.getMetadata?.(ROUTE_ARGS_METADATA, controller, methodName) ?? {};
      let bodyIndex = -1;
      for (const key of Object.keys(routeArgs)) {
        const [paramType] = key.split(':');
        if (Number(paramType) === BODY_PARAM_TYPE) {
          bodyIndex = routeArgs[key]?.index ?? -1;
          break;
        }
      }
      if (bodyIndex === -1) return null;
      const dtoClass = paramTypes[bodyIndex];
      if (!dtoClass || !dtoClass.name || ['Object', 'String', 'Number', 'Boolean', 'Array'].includes(dtoClass.name)) {
        return null;
      }
      return { name: dtoClass.name, fields: this.describeDtoFields(dtoClass) };
    } catch {
      return null;
    }
  }

  /** Reads class-validator's metadata storage if the package is installed in the host app. Falls back to []. */
  private describeDtoFields(dtoClass: Function): DtoShape['fields'] {
    try {
      // Resolved from the HOST application's node_modules (createRequire walks
      // up from this file's real location), not bundled with DevTools.
      if (!safeRequire) return [];
      const cv = safeRequire('class-validator');
      const storage = cv.getMetadataStorage?.();
      const metas = storage?.getTargetValidationMetadatas?.(dtoClass, '', true, false) ?? [];
      const byProperty = new Map<string, { types: string[]; optional: boolean }>();
      for (const meta of metas) {
        const entry = byProperty.get(meta.propertyName) ?? { types: [], optional: false };
        if (meta.name === 'isOptional') entry.optional = true;
        if (meta.name) entry.types.push(meta.name);
        byProperty.set(meta.propertyName, entry);
      }
      return [...byProperty.entries()].map(([name, info]) => ({
        name,
        type: info.types.find((t) => /^is[A-Z]/.test(t))?.replace(/^is/, '') ?? 'unknown',
        optional: info.optional,
        rules: dedupe(info.types),
      }));
    } catch {
      return [];
    }
  }
}

function readMetaNames(R: any, key: string, target: Function): string[] {
  try {
    const value = R.getMetadata?.(key, target) as Function[] | undefined;
    if (!Array.isArray(value)) return [];
    return value.map((fn) => fn?.name).filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

function normalizeSegment(segment: string | string[]): string {
  const s = Array.isArray(segment) ? segment[0] ?? '' : segment;
  return String(s ?? '').replace(/^\/+|\/+$/g, '');
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
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
