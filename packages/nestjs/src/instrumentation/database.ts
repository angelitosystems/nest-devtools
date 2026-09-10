import type { InstrumentationContext } from './http';
import type { ProjectInfo } from '@angelitosystems/devtools-protocol';
import type { DevToolsConfig } from '@angelitosystems/devtools-core';
import { requestContext } from '@angelitosystems/devtools-core';
import { Redactor, randomId } from '@angelitosystems/devtools-protocol';
import { emit } from '../emitter';
import { recordSpan } from './timeline';

/** Database instrumentation, best-effort provider detection. */
export class DatabaseInstrumentation {
  private readonly redactor: Redactor;
  private readonly config: DevToolsConfig;
  private readonly projectId: string;
  private readonly ctxRaw: InstrumentationContext;

  constructor(ctx: InstrumentationContext) {
    this.ctxRaw = ctx;
    this.config = ctx.config;
    this.projectId = ctx.projectInfo.projectId;
    this.redactor = new Redactor({
      redact: this.config.redact,
      allow: this.config.allow,
      maxBytes: this.config.maxPayloadBytes,
    });
  }

  /** Attach database hooks for detected clients. Returns cleanup. */
  attach(): () => void {
    const cleanup: Array<() => void> = [];

    if (!this.config.capture.database) return () => cleanup.forEach((fn) => fn());

    if (this.tryAttachTypeOrm()) cleanup.push(this.detachTypeOrm());
    if (this.tryAttachPrisma()) cleanup.push(this.detachPrisma());
    if (this.tryAttachMongoose()) cleanup.push(this.detachMongoose());

    return () => cleanup.forEach((fn) => fn());
  }

  private tryAttachTypeOrm(): boolean {
    try {
      const app = this.getApp();
      if (!app) return false;
      const dataSource = this.resolveTypeOrmDataSource(app);
      if (!dataSource) return false;

      if (typeof dataSource.query === 'function') {
        const originalQuery = dataSource.query.bind(dataSource);
        dataSource.__nestDevToolsOriginalQuery = originalQuery;
        dataSource.query = async (query: unknown, parameters?: unknown[]) => {
          const started = Date.now();
          this.startQuery(String(query), parameters ?? []);
          try {
            const result = await originalQuery(query, parameters);
            this.endQuery(String(query), parameters ?? [], Date.now() - started);
            return result;
          } catch (error) {
            this.endQuery(String(query), parameters ?? [], Date.now() - started, error);
            throw error;
          }
        };
        return true;
      }

      const listener = {
        beforeQuery: (query: string, parameters: unknown[]) => {
          this.startQuery(query, parameters);
        },
        afterQuery: (query: string, parameters: unknown[], durationMs: number) => {
          this.endQuery(query, parameters, durationMs);
        },
      };

      const sub = dataSource.subscriber;
      if (sub) {
        const before = sub.beforeQuery as ((q: string, p: unknown[]) => void) | undefined;
        const after = sub.afterQuery as ((q: string, p: unknown[], d: number) => void) | undefined;
        sub.beforeQuery = (q: string, p: unknown[]) => {
          try { before?.(q, p); } catch {}
          listener.beforeQuery(q, p);
        };
        sub.afterQuery = (q: string, p: unknown[], d: number) => {
          try { after?.(q, p, d); } catch {}
          listener.afterQuery(q, p, d);
        };
      } else {
        dataSource.subscriber = listener;
      }

      return true;
    } catch {
      return false;
    }
  }

  private detachTypeOrm(): () => void {
    return () => {
      try {
        const app = this.getApp();
        if (!app) return;
        const ds = this.resolveTypeOrmDataSource(app);
        if (!ds || !ds.subscriber) return;
        ds.subscriber = null;
      } catch {}
    };
  }

  private tryAttachPrisma(): boolean {
    try {
      const app = this.getApp();
      if (!app) return false;
      const prisma = this.resolvePrismaClient(app);
      if (!prisma) return false;

      if (typeof prisma.$use === 'function') {
        prisma.$use(async (params: any, next: (args: any) => Promise<unknown>) => {
          const label = `${params.model ?? 'prisma'}.${params.action ?? 'query'}`;
          const started = Date.now();
          this.startQuery(label, [params.args]);
          try {
            const result = await next(params);
            this.endQuery(label, [params.args], Date.now() - started);
            return result;
          } catch (error) {
            this.endQuery(label, [params.args], Date.now() - started, error);
            throw error;
          }
        });
        return true;
      }

      if (typeof prisma.$on === 'function') {
        prisma.$on('query', (event: { query?: string; params?: string; duration?: number; target?: string }) => {
          this.endQuery(event.query ?? 'prisma.query', event.params ? [event.params] : [], event.duration ?? 0);
        });
        return true;
      }

      const original = prisma.$queryRaw ?? prisma.$executeRaw ?? null;
      if (!original) return false;

      const wrapped = (query: unknown, parameters?: unknown) => {
        const started = Date.now();
        this.startQuery(String(query), parameters ? [parameters] : []);
        try {
          const result = original.call(prisma, query, parameters);
          if (result instanceof Promise) {
            return result.then((r) => {
              this.endQuery(String(query), parameters ? [parameters] : [], Date.now() - started);
              return r;
            });
          }
          this.endQuery(String(query), parameters ? [parameters] : [], Date.now() - started);
          return result;
        } catch (err) {
          this.endQuery(String(query), parameters ? [parameters] : [], Date.now() - started, err);
          throw err;
        }
      };

      prisma.$queryRaw = wrapped;
      prisma.$executeRaw = wrapped;
      return true;
    } catch {
      return false;
    }
  }

  private detachPrisma(): () => void {
    return () => {
      try {
        const app = this.getApp();
        if (!app) return;
        const prisma = this.resolvePrismaClient(app);
        if (!prisma) return;
        // restore original by removing wrapper and re-assigning? Not safe here.
        // We attempt a soft reset by clearing extension if possible.
        if (typeof prisma.$extends === 'function') prisma.$extends(prisma);
      } catch {}
    };
  }

  private tryAttachMongoose(): boolean {
    try {
      const app = this.getApp();
      if (!app) return false;
      const mongoose = this.resolveMongoose(app);
      if (!mongoose) return false;

      const instrumentation = this;
      const hook = mongoose.plugin((schema: any, _name: string) => {
        if (!schema || typeof schema !== 'object') return;
        const hooks = schema.pre ?? null;
        if (typeof hooks !== 'function') return;
        const bound = hooks.bind(schema);
        if (!bound) return;
        const originalPre = bound as (method: string, fn: unknown) => void;
        schema.pre = function (method: string, fn: unknown) {
          if (method === 'find' || method === 'findOne' || method === 'findById' || method === 'aggregate' || method === 'countDocuments' || method === 'count') {
            const wrapped = async function (this: unknown, ...args: unknown[]) {
              const started = Date.now();
              const sql = `[Mongoose:${method}]`;
              instrumentation.startQuery(sql, args);
              try {
                const handler = fn as ((...args: unknown[]) => unknown) | null;
                if (!handler) return;
                const result = await handler.apply(this, args);
                instrumentation.endQuery(sql, args, Date.now() - started);
                return result;
              } catch (err) {
                instrumentation.endQuery(sql, args, Date.now() - started, err);
                throw err;
              }
            };
            originalPre(method, wrapped as unknown);
          } else {
            originalPre(method, fn as unknown);
          }
        };
      });

      if (typeof mongoose.plugin === 'function') mongoose.plugin(hook);
      return true;
    } catch {
      return false;
    }
  }

  private detachMongoose(): () => void {
    return () => {
      try {
        const app = this.getApp();
        if (!app) return;
        const mongoose = this.resolveMongoose(app);
        if (!mongoose || typeof mongoose.plugin !== 'function') return;
        // Soft reset: re-plugin empty to override previous plugin?
        // Not safe to undo; we leave best-effort.
      } catch {}
    };
  }

  private startQuery(sql: string, parameters: unknown[]): void {
    if (!this.config.capture.database) return;
    const requestId = requestContext().requestId() ?? randomId('db');
    recordSpan(requestId, 'database', sql.slice(0, 120), {
      detail: `provider=${this.providerLabel()} parameters=${this.redactor.serialize(parameters)}`,
    });
  }

  private endQuery(
    sql: string,
    parameters: unknown[],
    durationMs: number,
    error?: unknown,
  ): void {
    if (!this.config.capture.database) return;
    const requestId = requestContext().requestId() ?? randomId('db');
    const payload = {
      requestId,
      projectId: this.projectId,
      provider: this.providerLabel() as any,
      sql: sql.slice(0, 2000),
      duration: durationMs,
      parameters: this.redactor.redact(parameters),
      timestamp: Date.now(),
    };
    emit('query.executed', payload as any);
  }

  private providerLabel(): string {
    if (this.isTypeOrm()) return 'typeorm';
    if (this.isPrisma()) return 'prisma';
    if (this.isMongoose()) return 'mongoose';
    return 'other';
  }

  private isTypeOrm(): boolean {
    return !!this.resolveTypeOrmDataSource(this.getApp());
  }

  private isPrisma(): boolean {
    return !!this.resolvePrismaClient(this.getApp());
  }

  private isMongoose(): boolean {
    return !!this.resolveMongoose(this.getApp());
  }

  private getApp(): any {
    try {
      const ctx = this.ctxRaw as any;
      if (ctx && typeof ctx === 'object' && (ctx as any).app) return (ctx as any).app;
      if (ctx && typeof ctx === 'object' && (ctx as any).getHttpAdapter) {
        return ctx as any;
      }
      return null;
    } catch {
      return null;
    }
  }

  private resolveTypeOrmDataSource(app: any): any {
    try {
      const dataSource = this.findProvider(app, (value) => typeof value?.query === 'function' && typeof value?.manager === 'object');
      if (dataSource) return dataSource;
      return null;
    } catch {
      return null;
    }
  }

  private resolvePrismaClient(app: any): any {
    try {
      const prisma = this.safeGet(app, 'PrismaService')
        ?? this.safeGet(app, 'PrismaClient')
        ?? this.safeGet(app, 'prisma')
        ?? this.findProvider(app, (value) => typeof value?.$queryRaw === 'function');
      if (prisma && typeof prisma.$queryRaw === 'function') return prisma;
      return null;
    } catch {
      return null;
    }
  }

  private resolveMongoose(app: any): any {
    try {
      const mongoose = this.safeGet(app, 'MongooseService')
        ?? this.safeGet(app, 'Mongoose')
        ?? this.safeGet(app, 'mongoose')
        ?? this.findProvider(app, (value) => typeof value?.plugin === 'function');
      if (mongoose && typeof mongoose.plugin === 'function') return mongoose;
      return null;
    } catch {
      return null;
    }
  }

  private safeGet(app: any, token: string): any {
    try {
      return app?.get?.(token, { strict: false }) ?? null;
    } catch {
      return null;
    }
  }

  private findProvider(app: any, predicate: (value: any) => boolean): any {
    try {
      const modules = app?.container?.getModules?.() ?? new Map();
      for (const module of modules.values()) {
        for (const wrapper of (module.providers?.values?.() ?? [])) {
          const instance = wrapper?.instance;
          if (instance && predicate(instance)) return instance;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

