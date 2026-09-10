/**
 * Copies the built dashboard into packages/cli/public so it ships inside the
 * CLI npm package (the server serves it at http://localhost:4317).
 */
import { cpSync, rmSync, existsSync, readFileSync } from 'fs';

const source = 'apps/dashboard/dist';
const target = 'packages/cli/public';

if (!existsSync(source)) {
  console.error(`✗ ${source} not found — build the dashboard first: bun run --cwd apps/dashboard build`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
const publishedIndex = readFileSync(`${target}/index.html`, 'utf8');
if (!publishedIndex.includes('/assets/')) {
  console.error(`✗ ${target}/index.html does not reference a built dashboard asset`);
  process.exit(1);
}
console.log(`✓ dashboard copied → ${target}`);
