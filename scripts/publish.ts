/**
 * Publishes the DevTools packages to npm in dependency order.
 * Uses npm Trusted Publishing in GitHub Actions via the workflow OIDC token.
 *
 * Workspace (private) packages are resolved via the "publish packed tarballs"
 * approach: we pack each package, then install from tarball so versioned
 * workspace:* dependencies become concrete versions before publishing.
 */
import { readFileSync, writeFileSync } from 'fs';
import { $ } from 'bun';

const REGISTRY = 'https://registry.npmjs.org/';

interface Pkg {
  name: string;
  version: string;
  path: string;
}

const PACKAGES: Pkg[] = [
  { name: '@angelitosystems/devtools-protocol', version: '', path: 'packages/protocol' },
  { name: '@angelitosystems/devtools-core', version: '', path: 'packages/core' },
  { name: '@angelitosystems/nest-devtools', version: '', path: 'packages/nestjs' },
  { name: '@angelitosystems/nest-devtools-cli', version: '', path: 'packages/cli' },
];

async function main(): Promise<void> {
  // 1. read versions
  for (const pkg of PACKAGES) {
    const manifest = JSON.parse(readFileSync(`${pkg.path}/package.json`, 'utf8'));
    pkg.version = manifest.version;
  }
  const version = PACKAGES[0].version;
  for (const pkg of PACKAGES) {
    if (pkg.version !== version) {
      console.error(`✗ versions out of sync: ${pkg.name}@${pkg.version} != ${version}`);
      process.exit(1);
    }
  }

  // 2. fail early if a package/version already exists
  for (const pkg of PACKAGES) {
    const probe = await $`npm view ${pkg.name}@${pkg.version} version --registry=${REGISTRY}`
      .nothrow()
      .quiet();
    if (probe.exitCode === 0 && probe.text().trim() === pkg.version) {
      console.error(`✗ ${pkg.name}@${pkg.version} is already published`);
      process.exit(1);
    }
  }

  // 3. replace workspace:* with concrete versions, pack, publish in order
  for (const pkg of PACKAGES) {
    const manifestPath = `${pkg.path}/package.json`;
    const original = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(original);

    const patched = JSON.parse(original);
    for (const section of ['dependencies', 'peerDependencies'] as const) {
      const deps = patched[section];
      if (!deps) continue;
      for (const [name, spec] of Object.entries(deps) as Array<[string, string]>) {
        if (spec === 'workspace:*' || spec === 'workspace:^') {
          const dep = PACKAGES.find((p) => p.name === name);
          deps[name] = dep ? `^${dep.version}` : spec;
        }
      }
    }

    writeFileSync(manifestPath, JSON.stringify(patched, null, 2));
    try {
      console.log(`▸ publishing ${pkg.name}@${pkg.version} ...`);
      const result = await $`npm publish ./${pkg.path} --access public --provenance --registry=${REGISTRY}`.nothrow();
      if (result.exitCode !== 0) {
        throw new Error(`npm publish failed for ${pkg.name}@${pkg.version} (exit code ${result.exitCode})`);
      }
      console.log(`✓ published ${pkg.name}@${pkg.version}`);
    } finally {
      // restore workspace:* manifest regardless of outcome
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }

  console.log(`\n✓ all packages published at v${version}`);
}

await main().then(
  () => process.exit(0),
  (error) => {
    console.error('✗ publish failed:', error);
    process.exit(1);
  },
);
