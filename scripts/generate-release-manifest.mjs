// Generates release/RELEASE_MANIFEST.json for the current build.
//
// Run AFTER `npm run build`:
//   node scripts/generate-release-manifest.mjs
//
// Construction lives in lib-release-manifest.mjs (shared with
// verify-release-manifest.mjs). Deterministic for a given commit + build
// output: no timestamps, artifact list sorted, SHA-256 checksums.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildReleaseManifest } from './lib-release-manifest.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const manifest = await buildReleaseManifest();

mkdirSync(resolve(root, 'release'), { recursive: true });
const outPath = resolve(root, 'release/RELEASE_MANIFEST.json');
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`version=${manifest.version} commit=${manifest.generated.commit} artifacts=${manifest.artifacts.length}`);
