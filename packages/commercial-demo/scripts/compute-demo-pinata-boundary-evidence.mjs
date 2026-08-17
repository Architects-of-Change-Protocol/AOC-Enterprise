// Computes REAL Pinata SDK import-boundary evidence for this package's own
// conformance certification (`__tests__/conformance.test.ts`).
//
// Boundary validation is required for certification: a harness that omits
// `boundaryEvaluation` fails the `provider-sdk-import-boundary` check rather
// than skipping it, because a Provider Adapter cannot be certified without
// proving no provider SDK leaks outside its own declared file(s) —
// "certification requires proof, not an assumption". This demo's harness
// previously omitted it, so its certification test failed on that one check.
//
// Deliberately mirrors
// `packages/provider-conformance-suite/scripts/compute-pinata-reference-boundary-evidence.mjs`
// rather than importing it, for that script's own stated reasons: it must run
// standalone as the first step of `npm test`, before any package is
// guaranteed to have a built `dist/` to import from, and this repository's
// `types/node-shims.d.ts` ambient declarations deliberately do not cover
// `node:fs`/`node:path` for compiled package sources — which is exactly why
// the evidence is computed here, in an uncompiled script, and handed to the
// TypeScript test as a small JSON file.
//
// Scanning rather than hard-coding is the point: if a future change adds a
// second file importing `pinata` anywhere in this repository, this script's
// output changes and this package's boundary check starts failing — the live
// proof a hard-coded importer list could never provide.

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
 * Duplicates `evaluateEnterpriseProviderConformanceBoundary`'s comparison
 * logic for the standalone-execution reason above. The definition of
 * "boundary-clean" lives in the suite
 * (`packages/provider-conformance-suite/src/enterprise-provider-conformance-suite.ts`);
 * this is a copy of it, not a second opinion about it.
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
