import type { DevToolsEventMap, DevToolsEventName, DevToolsMessage } from './types';
import { MIN_SUPPORTED_PROTOCOL_VERSION, PROTOCOL_VERSION } from './types';

/** Const array of every event name (runtime mirror of the type union). */
export const DEVTOOLS_EVENTS = [
  'project.connected',
  'project.disconnected',
  'request.started',
  'request.completed',
  'log.created',
  'error.created',
  'query.executed',
  'websocket.connected',
  'websocket.message',
  'performance.updated',
  'profile.started',
  'profile.completed',
  'plugin.event',
  'app.snapshot',
  'client.hello',
  'client.welcome',
  'stream.pause',
  'stream.resume',
  'state.clear',
  'state.snapshot',
  'state.ack',
  'error',
] as const satisfies readonly DevToolsEventName[];

/** True when `name` is a known protocol event. */
export function isDevToolsEventName(name: string): name is DevToolsEventName {
  return (DEVTOOLS_EVENTS as readonly string[]).includes(name);
}

/** Build a fully-typed wire message. */
export function createMessage<K extends DevToolsEventName>(
  event: K,
  payload: DevToolsEventMap[K],
  options?: { projectId?: string; id?: string; ts?: number },
): DevToolsMessage<DevToolsEventMap[K]> {
  return {
    v: PROTOCOL_VERSION,
    id: options?.id ?? randomId(),
    projectId: options?.projectId,
    ts: options?.ts ?? Date.now(),
    event,
    payload,
  };
}

/** Cheap collision-resistant id (no crypto dependency needed for wire correlation). */
export function randomId(prefix?: string): string {
  const core =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}_${core}` : core;
}

/** Type guard narrowing an unknown parsed frame into a DevToolsMessage. */
export function parseMessage(raw: string): DevToolsMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'event' in parsed &&
      'payload' in parsed &&
      'v' in parsed &&
      Number((parsed as { v: unknown }).v) === PROTOCOL_VERSION &&
      typeof (parsed as { id?: unknown }).id === 'string' &&
      typeof (parsed as { ts?: unknown }).ts === 'number' &&
      isDevToolsEventName(String((parsed as { event: unknown }).event))
    ) {
      return parsed as DevToolsMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/** True when a peer can safely communicate with this package. */
export function isSupportedProtocolVersion(version: number): boolean {
  return Number.isInteger(version) && version >= MIN_SUPPORTED_PROTOCOL_VERSION && version <= PROTOCOL_VERSION;
}
