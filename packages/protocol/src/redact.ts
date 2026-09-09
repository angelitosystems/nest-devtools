/** Default keys that are always redacted unless explicitly allowed. */
export const DEFAULT_REDACT_KEYS = [
  'password',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'authorization',
  'cookie',
  'cookies',
  'secret',
  'apiKey',
  'api_key',
  'client_secret',
  'clientSecret',
  'private_key',
  'privateKey',
  'session',
  'set-cookie',
] as const;

/** Default capture ceilings shared by SDK and server. */
export const MAX_CAPTURE_BYTES = 4 * 1024;
export const MAX_DEPTH = 4;

/** Options for deep redaction of arbitrary values. */
export interface RedactOptions {
  /** Extra key names to redact (case-insensitive, partial match allowed). */
  redact?: string[];
  /** Keys that should never be redacted even if they look sensitive. */
  allow?: string[];
  /** Placeholder string used for redacted values. */
  placeholder?: string;
  /** Max serialized size before truncation. */
  maxBytes?: number;
  /** Max object depth. */
  maxDepth?: number;
}

const DEFAULT_PLACEHOLDER = '[REDACTED]';
const TRUNCATION_SUFFIX = '…[truncated]';

/** Normalized set of denylist and allowlist key matchers. */
export class Redactor {
  private readonly deny: Set<string>;
  private readonly allow: Set<string>;
  private readonly placeholder: string;
  private readonly maxBytes: number;
  private readonly maxDepth: number;

  constructor(options?: RedactOptions) {
    this.deny = new Set([...DEFAULT_REDACT_KEYS, ...(options?.redact ?? [])].map(normalizeKey));
    this.allow = new Set((options?.allow ?? []).map(normalizeKey));
    this.placeholder = options?.placeholder ?? DEFAULT_PLACEHOLDER;
    this.maxBytes = options?.maxBytes ?? MAX_CAPTURE_BYTES;
    this.maxDepth = options?.maxDepth ?? MAX_DEPTH;
  }

  /** True when the given key is sensitive and not allowed. */
  isSensitive(key: string): boolean {
    const normalized = normalizeKey(key);
    if (this.allow.has(normalized)) return false;
    if (this.deny.has(normalized)) return true;
    // partial match: `userPassword`, `authTokenValue`, `x-api-key`...
    for (const denied of this.deny) {
      if (normalized.includes(denied)) return true;
    }
    return false;
  }

  /**
   * Deep-copy a value while redacting sensitive keys, truncating oversized
   * strings and enforcing depth limits. Circular references become '[Circular]'.
   */
  redact(value: unknown, depth = 0, seen = new Set<unknown>()): unknown {
    if (value === null || typeof value !== 'object') {
      return redactPrimitive(value);
    }
    if (seen.has(value)) return '[Circular]';
    if (depth >= this.maxDepth) return '[MaxDepth]';

    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => this.redact(item, depth + 1, seen));
      }
      if (value instanceof Error) {
        return { name: value.name, message: value.message };
      }
      if (value instanceof Date) return value.toISOString();

      const out: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        out[key] = this.isSensitive(key) ? this.placeholder : this.redact(raw, depth + 1, seen);
      }
      return out;
    } finally {
      seen.delete(value);
    }
  }

  /** Redact sensitive substrings (key=value / key: value / bearer tokens) from free-form text. */
  redactString(text: string): string {
    let out = text;
    for (const denied of this.deny) {
      const camel = denied;
      const pattern = new RegExp(`(${escapeRegExp(camel)}|${escapeRegExp(denied.replace(/[-_]/g, ''))})\\s*[=:]\\s*([^\\s,&;]+)`, 'gi');
      out = out.replace(pattern, `$1=${this.placeholder}`);
    }
    out = out.replace(/bearer\s+[a-z0-9._-]+/gi, `Bearer ${this.placeholder}`);
    return out;
  }

  /** Serialize a value safely: redacted, size-capped, never throws. */
  serialize(value: unknown): string {
    try {
      const safe = this.redact(value);
      const json = JSON.stringify(safe) ?? String(safe);
      return truncateUtf8(json, this.maxBytes, TRUNCATION_SUFFIX);
    } catch {
      return '[Unserializable]';
    }
  }
}

/** Shared default redactor instance for quick helpers. */
export const defaultRedactor = new Redactor();

/** Convenience: deep-redact with the default policy. */
export function redactValue(value: unknown): unknown {
  return defaultRedactor.redact(value);
}

/** Convenience: scrub a free-form string with the default policy. */
export function redactText(text: string): string {
  return defaultRedactor.redactString(text);
}

function redactPrimitive(value: unknown): unknown {
  if (typeof value === 'string') return defaultRedactor.redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'bigint') return value.toString() + 'n';
  return String(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** UTF-8-safe truncation that never splits a multi-byte character. */
function truncateUtf8(text: string, maxBytes: number, suffix: string): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  const cut = Math.max(0, maxBytes - Buffer.byteLength(suffix, 'utf8'));
  return buf.subarray(0, cut).toString('utf8') + suffix;
}
