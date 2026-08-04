// R005.C Phase 8/10 -- "No Enterprise contract imports Pinata. Only Adapter
// imports Pinata," proven here rather than merely asserted in prose. Mirrors
// the style of the repo-root scripts/check-aoc-boundaries.mjs. Run as plain
// Node (not compiled by tsc) so it can use the full node:fs/node:path API
// without depending on this repo's deliberately minimal types/node-shims.d.ts
// ambient declarations, which back the strict compile of this package's own
// TypeScript sources.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-test', '.git']);
const PINATA_IMPORT_PATTERN = /from\s+['"]pinata['"]|require\(\s*['"]pinata['"]\s*\)/;

function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function importers(dir) {
  return walk(dir)
    .filter((file) => PINATA_IMPORT_PATTERN.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(`${repoRoot}/`, ''));
}

const violations = [];

const thisPackageImporters = importers(join(packageRoot, 'src'));
const expected = ['packages/pinata-adapter/src/pinata-provider-client.ts'];
if (JSON.stringify([...thisPackageImporters].sort()) !== JSON.stringify(expected)) {
  violations.push(
    `Expected exactly one 'pinata' importer in packages/pinata-adapter/src (pinata-provider-client.ts), found: ${JSON.stringify(thisPackageImporters)}`,
  );
}

const packagesDir = join(repoRoot, 'packages');
for (const packageName of readdirSync(packagesDir)) {
  if (packageName === 'pinata-adapter') continue;
  const packagePath = join(packagesDir, packageName);
  if (!statSync(packagePath).isDirectory()) continue;
  for (const violation of importers(packagePath)) {
    violations.push(`Enterprise package '${packageName}' must not import 'pinata': ${violation}`);
  }
}

for (const violation of importers(join(repoRoot, 'src'))) {
  violations.push(`Repository-root src/ must not import 'pinata': ${violation}`);
}

if (violations.length > 0) {
  console.error('Pinata SDK import boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Pinata SDK import boundary check passed: 'pinata' is imported only by packages/pinata-adapter/src/pinata-provider-client.ts");
