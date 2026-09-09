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
