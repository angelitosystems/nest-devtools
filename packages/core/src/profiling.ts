import * as inspector from 'node:inspector';
import { randomId } from '@angelitosystems/devtools-protocol';

export type ProfileKind = 'cpu' | 'heap';
export interface ProfileResult {
  profileId: string;
  kind: ProfileKind;
  startedAt: number;
  completedAt: number;
  data: unknown;
}

/** Optional Node profiler. It is inert until a caller explicitly starts a session. */
export class NodeProfiler {
  private session: inspector.Session | undefined;
  private active: { profileId: string; kind: ProfileKind; startedAt: number } | undefined;

  async start(kind: ProfileKind): Promise<{ profileId: string; startedAt: number }> {
    if (this.active) throw new Error('A profile is already running');
    const profileId = randomId('profile');
    const startedAt = Date.now();
    this.active = { profileId, kind, startedAt };

    if (kind === 'cpu') {
      this.session = new inspector.Session();
      this.session.connect();
      await post(this.session, 'Profiler.enable');
      await post(this.session, 'Profiler.start');
    }

    return { profileId, startedAt };
  }

  async stop(): Promise<ProfileResult> {
    const active = this.active;
    if (!active) throw new Error('No profile is running');

    let data: unknown;
    if (active.kind === 'cpu' && this.session) {
      const response = await post(this.session, 'Profiler.stop');
      await post(this.session, 'Profiler.disable').catch(() => undefined);
      this.session.disconnect();
      this.session = undefined;
      data = response;
    } else {
      const memory = process.memoryUsage();
      data = { rss: memory.rss, heapTotal: memory.heapTotal, heapUsed: memory.heapUsed, external: memory.external };
    }

    this.active = undefined;
    return { ...active, completedAt: Date.now(), data };
  }
}

function post(session: inspector.Session, method: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post(method, (error, result) => (error ? reject(error) : resolve(result)));
  });
}
