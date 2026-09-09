import { devtools as coreDevtools } from '@angelitosystems/devtools-core';
import type { DevToolsEventMap, DevToolsEventName } from '@angelitosystems/devtools-protocol';

/** Emit a typed protocol event to the DevTools server (fire-and-forget). */
export function emit<K extends DevToolsEventName>(event: K, payload: DevToolsEventMap[K]): void {
  try {
    coreDevtools.send(event, payload);
  } catch {
    /* instrumentation must never break the app */
  }
}
