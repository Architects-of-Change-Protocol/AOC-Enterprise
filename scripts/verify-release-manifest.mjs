// Release-manifest verification (PR-RC Objective 9 / 11).
//
// Proves two properties, running AFTER `npm run build`:
//   1. Determinism: two in-memory regenerations are byte-identical.
//   2. Freshness: the committed release/RELEASE_MANIFEST.json matches a
//      regeneration from the current build, ignoring only the `generated`
//      block (commit/branch/node are point-of-generation metadata by design;
//      the final tag regenerates the manifest one last time).
//
// A checksum or version drift means the committed manifest is stale:
// re-run `node scripts/generate-release-manifest.mjs` and commit it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildReleaseManifest } from './lib-release-manifest.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);

function fail(message) {
  console.error(`[manifest-verify] ${message}`);
  process.exit(1);
}

const withoutGenerated = (manifest) => {
  const { generated, ...rest } = manifest;
  void generated;
  return rest;
};

const first = await buildReleaseManifest();
const second = await buildReleaseManifest();
if (JSON.stringify(first) !== JSON.stringify(second)) {
  fail('Manifest generation is not deterministic: two consecutive regenerations differ.');
}

let committed;
try {
  committed = JSON.parse(readFileSync(resolve(root, 'release/RELEASE_MANIFEST.json'), 'utf8'));
} catch {
  fail('release/RELEASE_MANIFEST.json is missing or unparsable; generate it with scripts/generate-release-manifest.mjs.');
}

const expected = JSON.stringify(withoutGenerated(first), null, 2);
const actual = JSON.stringify(withoutGenerated(committed), null, 2);
if (expected !== actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const firstDiff = expectedLines.findIndex((line, index) => line !== actualLines[index]);
  fail(
    `Committed manifest is stale relative to the current build (first difference at line ${firstDiff + 1}: ` +
      `expected ${JSON.stringify(expectedLines[firstDiff] ?? '<eof>')}, committed ${JSON.stringify(actualLines[firstDiff] ?? '<eof>')}). ` +
      'Regenerate with `node scripts/generate-release-manifest.mjs` and commit the result.',
  );
}

console.log(`Manifest verification passed: deterministic generation, committed manifest matches the build (${first.artifacts.length} artifacts, version ${first.version}).`);
