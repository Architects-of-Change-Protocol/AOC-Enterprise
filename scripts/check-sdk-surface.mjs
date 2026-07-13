// SDK public-surface verification (PR-RC Objectives 4 / 11).
//
// The @aoc-enterprise/enterprise-host-sdk package is transport-only and its
// public surface is frozen. This check builds nothing: it loads the compiled
// entrypoint and asserts the runtime exports match the frozen list exactly
// (no internal leakage, no accidental additions/removals), and that the
// package manifest keeps the SDK dependency-free.
//
// Run AFTER `npm run build`.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const sdkRoot = resolve(root, 'packages/enterprise-host-sdk');

function fail(message) {
  console.error(`[sdk-surface] ${message}`);
  process.exit(1);
}

const FROZEN_RUNTIME_EXPORTS = [
  'EnterpriseHostApiError',
  'EnterpriseHostNetworkError',
  'EnterpriseHostTimeoutError',
  'createEnterpriseHostClient',
  'isEnterpriseHostApiError',
];

const entry = resolve(sdkRoot, 'dist/index.js');
if (!existsSync(entry)) fail(`SDK build output missing at ${entry}; run npm run build first.`);

const loaded = await import(entry);
// 'default' and '__esModule' are CJS-interop artifacts, not part of the surface.
const actual = Object.keys(loaded).filter((name) => name !== 'default' && name !== '__esModule').sort();
if (JSON.stringify(actual) !== JSON.stringify(FROZEN_RUNTIME_EXPORTS)) {
  fail(`SDK runtime exports drifted. Expected ${JSON.stringify(FROZEN_RUNTIME_EXPORTS)}, got ${JSON.stringify(actual)}. The SDK surface is frozen for v1; update this list only as a deliberate, reviewed change.`);
}

const pkg = JSON.parse(readFileSync(resolve(sdkRoot, 'package.json'), 'utf8'));
if (pkg.dependencies !== undefined && Object.keys(pkg.dependencies).length > 0) {
  fail(`SDK must stay dependency-free; found dependencies: ${Object.keys(pkg.dependencies).join(', ')}.`);
}
if (pkg.exports?.['.']?.types !== './dist/index.d.ts' || pkg.exports?.['.']?.default !== './dist/index.js') {
  fail('SDK exports map drifted from the frozen entrypoint (./dist/index.js + ./dist/index.d.ts).');
}
if (!existsSync(resolve(sdkRoot, 'dist/index.d.ts'))) fail('SDK type declarations missing from build output.');

// The client must never import Enterprise runtime internals -- transport only.
const sdkSources = ['src/index.ts', 'src/client.ts', 'src/errors.ts', 'src/types.ts'];
for (const source of sdkSources) {
  const text = readFileSync(resolve(sdkRoot, source), 'utf8');
  const importSpecifiers = [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  const foreign = importSpecifiers.filter((specifier) => !specifier.startsWith('./'));
  if (foreign.length > 0) {
    fail(`SDK source ${source} imports outside the package: ${foreign.join(', ')}. The SDK is self-contained by contract.`);
  }
}

console.log(`SDK surface check passed: ${FROZEN_RUNTIME_EXPORTS.length} frozen exports, zero dependencies, self-contained sources.`);
