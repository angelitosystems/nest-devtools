/**
 * Copies the built dashboard into packages/cli/public so it ships inside the
 * CLI npm package (the server serves it at http://localhost:4317).
 */
import { cpSync, rmSync, existsSync } from 'fs';

const source = 'apps/dashboard/dist';
const target = 'packages/cli/public';

if (!existsSync(source)) {
  console.error(`✗ ${source} not found — build the dashboard first: bun run --cwd apps/dashboard build`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`✓ dashboard copied → ${target}`);
