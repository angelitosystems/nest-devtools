#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const version = process.argv[2];
if (!version) {
  console.error("Uso: bun scripts/set-version.ts <version>");
  process.exit(1);
}

const packagesDir = join(import.meta.dir, "..", "packages");

for (const name of readdirSync(packagesDir)) {
  const pkgJsonPath = join(packagesDir, name, "package.json");
  if (!existsSync(pkgJsonPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  pkg.version = version;

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const dep of Object.keys(deps)) {
      if (dep.startsWith("@angelitosystems/")) deps[dep] = version;
    }
  }

  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✓ ${pkg.name} → ${version}`);
}

const sdkVersionPath = join(packagesDir, 'nestjs', 'src', 'version.ts');
if (existsSync(sdkVersionPath)) {
  writeFileSync(sdkVersionPath, `/** SDK version reported to the DevTools server. Keep in sync with package.json. */\nexport const SDK_VERSION = '${version}';\n`);
}

const cliVersionPath = join(packagesDir, 'cli', 'src', 'version.ts');
if (existsSync(cliVersionPath)) {
  writeFileSync(cliVersionPath, `/** CLI version reported to connected SDKs and dashboards. */\nexport const CLI_VERSION = '${version}';\n`);
}
