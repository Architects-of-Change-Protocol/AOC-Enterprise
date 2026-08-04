// R005.D Phase 4/8 -- "Enterprise never imports providers. Providers never
// modify Enterprise. Provider SDKs never leak. No provider objects cross the
// boundary," proven here for the Provider Conformance Suite's own package,
// mirroring packages/pinata-adapter/scripts/check-pinata-boundary.mjs. Run as
// plain Node (not compiled by tsc), matching that script's own stated reason:
// this repository's types/node-shims.d.ts ambient declarations deliberately
// do not cover node:fs/node:path for compiled package sources.
//
// Two invariants are proven, not merely asserted in prose:
//
// 1. `src/` -- the suite's own production code -- never imports a known
//    provider SDK directly, and never imports a concrete Provider Adapter
//    package (any `@aoc-enterprise/*-adapter` package other than the frozen
//    `@aoc-enterprise/provider-adapter` *contract* package, which is not a
//    provider implementation despite its name). The suite certifies
//    adapters; it must never depend on one. Both static (`from '...'`,
//    `require(...)`) and dynamic (`import('...')`) imports are scanned.
// 2. Exactly one file, `__tests__/reference-pinata-conformance.test.ts` (the
//    R005.D Phase 10 reference execution), is permitted to import a concrete
//    adapter package -- proving the suite actually certifies a real
//    implementation. No other test file may.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-test', '.git']);
// Matches static `from '...'`, `require('...')`, AND dynamic `import('...')`
// -- a provider SDK or concrete adapter package pulled in via a dynamic
// import is exactly as much of a boundary violation as a static one.
const PROVIDER_SPECIFIER_GROUP = "(pinata|aws-sdk|@aws-sdk\\/[a-z0-9-]+|@azure\\/[a-z0-9-]+|googleapis|dropbox)";
const KNOWN_PROVIDER_SDK_PATTERN = new RegExp(
  `from\\s+['"]${PROVIDER_SPECIFIER_GROUP}['"]|require\\(\\s*['"]${PROVIDER_SPECIFIER_GROUP}['"]\\s*\\)|import\\(\\s*['"]${PROVIDER_SPECIFIER_GROUP}['"]\\s*\\)`,
);
const CONCRETE_ADAPTER_IMPORT_PATTERN =
  /from\s+['"]@aoc-enterprise\/([a-z0-9-]+)-adapter['"]|require\(\s*['"]@aoc-enterprise\/([a-z0-9-]+)-adapter['"]\s*\)|import\(\s*['"]@aoc-enterprise\/([a-z0-9-]+)-adapter['"]\s*\)/g;

// 'provider' -> '@aoc-enterprise/provider-adapter' is the frozen R005.A
// *contract* package, not a concrete provider implementation, and is exempt
// from the "-adapter" concrete-adapter pattern by name collision only. Every
// other "*-adapter" package in this repository (e.g. 'pinata-adapter') is a
// real provider implementation.
const CONTRACT_PACKAGE_EXEMPTIONS = new Set(['provider']);

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

function findConcreteAdapterImports(text) {
  const found = [];
  CONCRETE_ADAPTER_IMPORT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CONCRETE_ADAPTER_IMPORT_PATTERN)) {
    const packageStem = match[1] ?? match[2] ?? match[3];
    if (CONTRACT_PACKAGE_EXEMPTIONS.has(packageStem)) continue;
    found.push(`@aoc-enterprise/${packageStem}-adapter`);
  }
  return found;
}

const violations = [];

for (const file of walk(join(packageRoot, 'src'))) {
  const text = readFileSync(file, 'utf8');
  const relative = file.replace(`${packageRoot}/`, '');
  if (KNOWN_PROVIDER_SDK_PATTERN.test(text)) {
    violations.push(`${relative}: imports a provider SDK directly -- the Provider Conformance Suite must remain provider-neutral in production code.`);
  }
  for (const found of findConcreteAdapterImports(text)) {
    violations.push(`${relative}: imports concrete adapter package '${found}' -- the suite must certify adapters, never depend on one.`);
  }
}

const expectedReferenceExecutionFile = '__tests__/reference-pinata-conformance.test.ts';
const concreteAdapterImportersInTests = [];
for (const file of walk(join(packageRoot, '__tests__'))) {
  const text = readFileSync(file, 'utf8');
  const relative = file.replace(`${packageRoot}/`, '');
  for (const found of findConcreteAdapterImports(text)) {
    concreteAdapterImportersInTests.push({ relative, found });
  }
}

for (const { relative, found } of concreteAdapterImportersInTests) {
  if (relative !== expectedReferenceExecutionFile) {
    violations.push(
      `${relative}: imports concrete adapter package '${found}' outside the one designated Phase 10 reference-execution test file (${expectedReferenceExecutionFile}).`,
    );
  }
}

if (!concreteAdapterImportersInTests.some((entry) => entry.relative === expectedReferenceExecutionFile)) {
  violations.push(
    `${expectedReferenceExecutionFile}: expected this file to import a concrete adapter package (the Phase 10 reference execution against Pinata), but it does not.`,
  );
}

if (violations.length > 0) {
  console.error('Provider Conformance Suite boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  "Provider Conformance Suite boundary check passed: src/ imports no provider SDK and no concrete adapter package; " +
    'only __tests__/reference-pinata-conformance.test.ts imports a concrete adapter (the Phase 10 reference execution).',
);
