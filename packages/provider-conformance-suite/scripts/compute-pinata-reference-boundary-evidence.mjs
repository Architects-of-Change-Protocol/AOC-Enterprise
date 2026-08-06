// R005.D Phase 10 -- computes REAL boundary-scan evidence for the reference
// execution against the Pinata Provider Adapter
// (`__tests__/reference-pinata-conformance.test.ts`), rather than that test
// hard-coding the already-known-true importer-file lists. If a future
// change ever adds a second file that imports `pinata` anywhere in this
// repository, this script's output changes and the reference test's
// boundary-validation check starts failing -- exactly the live proof the
// hard-coded version could not provide.
//
// Run as plain Node (not compiled by tsc), matching
// `scripts/check-provider-conformance-boundary.mjs`'s own stated reason:
// this repository's types/node-shims.d.ts ambient declarations deliberately
// do not cover node:fs/node:path for compiled package sources -- which is
// also exactly why this evidence is computed here, in an uncompiled script,
// and handed to the TypeScript test as a small JSON file (read back through
// the shim's own limited, but typed, unprefixed 'fs' module) rather than
// scanned from inside the compiled test itself.
//
// Wired in as the first step of this package's own `npm test` (see
// package.json), so the evidence is always freshly recomputed against the
// current working tree before the reference test reads it.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-test', '.git']);
const PINATA_IMPORT_PATTERN = /from\s+['"]pinata['"]|require\(\s*['"]pinata['"]\s*\)|import\s*\(\s*['"]pinata['"]\s*\)/;

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

function pinataImporters(dir) {
  return walk(dir)
    .filter((file) => PINATA_IMPORT_PATTERN.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(`${repoRoot}/`, ''));
}

/**
 * Deliberately duplicates `evaluateEnterpriseProviderConformanceBoundary`'s
 * own comparison logic (`packages/provider-conformance-suite/src/enterprise-provider-conformance-suite.ts`)
 * rather than importing it: this script must run standalone, as the first
 * step of `npm test`, before the package it belongs to is guaranteed to
 * have a built `dist/` to import from.
 */
function evaluateBoundary({ providerModuleName, allowedImporterFiles, actualImporterFilesWithinAdapter, foreignImporterFiles }) {
  const issues = [];

  for (const file of foreignImporterFiles) {
    issues.push({
      code: 'FOREIGN_IMPORTER_FOUND',
      message: `'${file}' imports '${providerModuleName}' outside the adapter's own package -- Enterprise contracts and other adapters must never import a provider SDK.`,
    });
  }

  const allowed = new Set(allowedImporterFiles);
  const actual = new Set(actualImporterFilesWithinAdapter);

  for (const file of actual) {
    if (!allowed.has(file)) {
      issues.push({
        code: 'UNEXPECTED_ADAPTER_IMPORTER',
        message: `'${file}' imports '${providerModuleName}' but is not one of the adapter's declared allowed importer files.`,
      });
    }
  }

  for (const file of allowed) {
    if (!actual.has(file)) {
      issues.push({
        code: 'MISSING_EXPECTED_ADAPTER_IMPORTER',
        message: `Declared allowed importer '${file}' does not actually import '${providerModuleName}'.`,
      });
    }
  }

  return issues.length === 0 ? { valid: true } : { valid: false, issues };
}

const allowedImporterFiles = ['packages/pinata-adapter/src/pinata-provider-client.ts'];
const actualImporterFilesWithinAdapter = pinataImporters(join(repoRoot, 'packages', 'pinata-adapter', 'src'));

const foreignImporterFiles = [];
const packagesDir = join(repoRoot, 'packages');
for (const packageName of readdirSync(packagesDir)) {
  if (packageName === 'pinata-adapter') continue;
  const packagePath = join(packagesDir, packageName);
  if (!statSync(packagePath).isDirectory()) continue;
  foreignImporterFiles.push(...pinataImporters(packagePath));
}
foreignImporterFiles.push(...pinataImporters(join(repoRoot, 'src')));

const result = evaluateBoundary({
  providerModuleName: 'pinata',
  allowedImporterFiles,
  actualImporterFilesWithinAdapter,
  foreignImporterFiles,
});

const outDir = join(packageRoot, 'dist-test');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'pinata-boundary-evidence.json');
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(
  `Computed real Pinata SDK import-boundary evidence -> ${outPath.replace(`${repoRoot}/`, '')}: ` +
    `${result.valid ? 'valid' : `invalid (${result.issues.length} issue(s))`}`,
);
