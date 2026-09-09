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
  private readonly ctx: InstrumentationContext;

  constructor(ctx: InstrumentationContext) {
    this.ctx = ctx;
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

      const hook = mongoose.plugin((schema: any, _name: string) => {
        if (!schema || typeof schema !== 'object') return;
        const hooks = schema.pre ?? null;
        if (typeof hooks !== 'function') return;
        const originalPre = hooks.bind(schema);
        (schema as Record<string, unknown>).pre = function (method: string, fn: unknown) {
          if (method === 'find' || method === 'findOne' || method === 'findById' || method === 'aggregate' || method === 'countDocuments' || method === 'count') {
            const wrapped = async function (this: unknown, ...args: unknown[]) {
              const started = Date.now();
              const sql = `[Mongoose:${method}]`;
              this.startQuery(sql, args);
              try {
                const handler = fn as ((...args: unknown[]) => unknown) | null;
                if (!handler) return;
                const result = await handler.apply(this, args);
                this.endQuery(sql, args, Date.now() - started);
                return result;
              } catch (err) {
                this.endQuery(sql, args, Date.now() - started, err);
                throw err;
              }
            };
            originalPre.call(schema, method, wrapped);
          } else {
            originalPre.call(schema, method, fn);
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
      const ctxAny = this.ctx as any;
      if (ctxAny && typeof ctxAny === 'object' && ctxAny.app) return ctxAny.app;
      if (ctxAny && typeof ctxAny === 'object' && ctxAny.getHttpAdapter) {
        return ctxAny;
      }
      return null;
    } catch {
      return null;
    }
  }

  private resolveTypeOrmDataSource(app: any): any {
    try {
      const dataSource = app.get(require('@nestjs/typeorm').TypeOrmModule)?.options?.DataSource ?? null;
      if (dataSource && typeof dataSource.query === 'function') return dataSource;
      return null;
    } catch {
      return null;
    }
  }

  private resolvePrismaClient(app: any): any {
    try {
      const prisma = app.get('PrismaService') ?? app.get('PrismaClient') ?? app.get('prisma') ?? null;
      if (prisma && typeof prisma.$queryRaw === 'function') return prisma;
      return null;
    } catch {
      return null;
    }
  }

  private resolveMongoose(app: any): any {
    try {
      const mongoose = app.get('MongooseService') ?? app.get('Mongoose') ?? app.get('mongoose') ?? null;
      if (mongoose && typeof mongoose.plugin === 'function') return mongoose;
      return null;
    } catch {
      return null;
    }
  }
}

