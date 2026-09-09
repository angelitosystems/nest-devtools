import type { InstrumentationContext } from './http';

/**
 * Database instrumentation (v0.3 roadmap).
 *
 * Provider strategies will live here:
 *  - Prisma: $extends / $use hooks
 *  - TypeORM: DataSource QueryListener via subscriber
 *  - Sequelize: sequelize.addHook
 *  - MikroORM: EntityManager event subscriber
 *
 * All strategies must attach spans to the active request via trackSpans/
 * recordSpan and emit query.executed with redacted parameters.
 */
export class DatabaseInstrumentation {
  constructor(private readonly ctx: InstrumentationContext) {}

  /** No-op for now. Returns a no-op cleanup. */
  attach(): () => void {
    void this.ctx;
    return () => {};
  }
}
