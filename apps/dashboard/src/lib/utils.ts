/** Conditional className joiner (tiny clsx). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Human duration formatting. */
export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Byte formatting. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Time formatting (HH:MM:SS). */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

/** HTTP status color class. */
export function statusColor(status: number): string {
  if (status >= 500) return 'text-rose-400';
  if (status >= 400) return 'text-amber-400';
  if (status >= 300) return 'text-sky-300';
  return 'text-emerald-400';
}

/** Log level color class. */
export function levelColor(level: string): string {
  switch (level) {
    case 'error':
      return 'text-rose-400';
    case 'warn':
      return 'text-amber-400';
    case 'debug':
      return 'text-slate-500';
    case 'verbose':
      return 'text-slate-400';
    default:
      return 'text-sky-300';
  }
}

/** Badge classes (bg + text + border) for an HTTP method. */
export function methodBadgeClasses(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-method-get/10 text-method-get border-method-get/30';
    case 'POST':
      return 'bg-method-post/10 text-method-post border-method-post/30';
    case 'PUT':
      return 'bg-method-put/10 text-method-put border-method-put/30';
    case 'PATCH':
      return 'bg-method-patch/10 text-method-patch border-method-patch/30';
    case 'DELETE':
      return 'bg-method-delete/10 text-method-delete border-method-delete/30';
    case 'HEAD':
      return 'bg-method-head/10 text-method-head border-method-head/30';
    default:
      return 'bg-method-options/10 text-method-options border-method-options/30';
  }
}

/** Dot color class for a connection/status state. */
export function statusDotColor(status: number): string {
  if (status >= 500) return 'bg-rose-400';
  if (status >= 400) return 'bg-amber-400';
  if (status >= 300) return 'bg-sky-300';
  return 'bg-emerald-400';
}

/** Copy text to the clipboard; resolves true/false so callers can show feedback. */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** Build a copy-pasteable cURL command from a captured request. */
export function toCurl(request: {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
}): string {
  const parts = [`curl -X ${request.method}`, `'${request.url}'`];
  if (request.requestHeaders) {
    for (const [key, value] of Object.entries(request.requestHeaders)) {
      parts.push(`-H '${key}: ${value}'`);
    }
  }
  if (request.requestBody !== undefined) {
    const body = typeof request.requestBody === 'string' ? request.requestBody : JSON.stringify(request.requestBody);
    parts.push(`--data '${body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(' \\\n  ');
}
