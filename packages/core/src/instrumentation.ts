/** Result of a successful patch operation. */
export interface PatchHandle {
  restore: () => void;
}

/**
 * Replace a method on an object prototype/instance and get a restore handle.
 * Returns null when the target method is missing — patching is always best-effort.
 */
export function patchMethod<T extends object>(
  target: T,
  method: keyof T & (string | symbol),
  replacement: (original: (...args: never[]) => unknown) => (...args: never[]) => unknown,
): PatchHandle | null {
  const owner = target as unknown as Record<string | symbol, unknown>;
  const original = owner[method];
  if (typeof original !== 'function') return null;
  const originalFn = original as unknown as (...args: never[]) => unknown;

  let patched = false;
  try {
    owner[method] = replacement(originalFn) as unknown;
    patched = true;
  } catch {
    return null;
  }

  return {
    restore: () => {
      if (!patched) return;
      try {
        owner[method] = originalFn;
        patched = false;
      } catch {
        /* ignore */
      }
    },
  };
}

/** Deterministic sampling: true when `rate` >= 1, false when <= 0. */
export function shouldSample(rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}

/** Safe JSON stringify that never throws (BigInt, circular, etc.). */
export function safeStringify(value: unknown, maxBytes?: number): string {
  const seen = new WeakSet<object>();
  let out: string;
  try {
    out = JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    out = '[Unserializable]';
  }
  if (maxBytes !== undefined && out.length > maxBytes) {
    return `${out.slice(0, maxBytes)}…[truncated]`;
  }
  return out;
}

/** Bound an async operation; resolves undefined on timeout (used to avoid hangs). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms).unref?.()),
  ]);
}
