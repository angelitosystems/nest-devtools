/**
 * Publishes the DevTools packages to npm in dependency order.
 * Requires NPM_TOKEN in the environment (set by the release workflow).
 *
 * Workspace (private) packages are resolved via the "publish packed tarballs"
 * approach: we pack each package, then install from tarball so versioned
 * workspace:* dependencies become concrete versions before publishing.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

async function askSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`${question.trim()} requires an interactive terminal`);
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('input cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
    };

    process.stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const token = process.env.NPM_TOKEN ?? await askSecret('npm token: ');
  if (!token) throw new Error('npm token is required');

  const otp = process.env.NPM_OTP ?? await askSecret('npm OTP (press Enter if not required): ');
  if (otp) process.env.NPM_OTP = otp;

  const npmConfigPath = join(tmpdir(), `nests-devtools-npm-${process.pid}.npmrc`);
  const previousUserConfig = process.env.NPM_CONFIG_USERCONFIG;
  writeFileSync(npmConfigPath, `//registry.npmjs.org/:_authToken=${token}\nalways-auth=true\n`);
  process.env.NPM_CONFIG_USERCONFIG = npmConfigPath;
  process.on('exit', () => {
    unlinkSync(npmConfigPath);
    if (previousUserConfig) process.env.NPM_CONFIG_USERCONFIG = previousUserConfig;
    else delete process.env.NPM_CONFIG_USERCONFIG;
  });

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
      const result = process.env.NPM_OTP
        ? await $`npm publish ./${pkg.path} --access public --registry=${REGISTRY} --otp=${process.env.NPM_OTP}`.nothrow()
        : await $`npm publish ./${pkg.path} --access public --registry=${REGISTRY}`.nothrow();
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
