import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

let cached: string | null | undefined;

/** Best-effort detection of the host app's @nestjs/core version. */
export function detectNestJsVersion(): string | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const candidates = [
      resolve(process.cwd(), 'node_modules/@nestjs/core/package.json'),
      // bun/pnpm layouts: walk up a couple of levels
      resolve(process.cwd(), '../../node_modules/@nestjs/core/package.json'),
    ];
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
      if (pkg.version) {
        cached = pkg.version;
        break;
      }
    }
  } catch {
    cached = null;
  }
  return cached;
}
