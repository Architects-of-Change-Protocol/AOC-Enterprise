#!/usr/bin/env node
// Cross-checks a freshly-built @aoc/protocol tarball artifact descriptor (the
// JSON object printed by build-protocol-tarball.mjs) against
// protocol-consumer.lock.json. Fails loudly on any mismatch -- this is what
// stops a stale, wrong-commit, or tampered tarball from being silently trusted.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateCompatibilityLock, verifyArtifactAgainstLock } from './lib-protocol-artifact.mjs';

async function main() {
  const artifactPathArg = process.argv[2];
  if (!artifactPathArg) {
    throw new Error('Usage: node scripts/protocol/verify-tarball-against-lock.mjs <build-result.json>');
  }

  const artifact = JSON.parse(await readFile(resolve(artifactPathArg), 'utf8'));
  const lockPath = resolve(process.cwd(), 'protocol-consumer.lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));

  const lockCheck = validateCompatibilityLock(lock);
  if (!lockCheck.valid) {
    console.error('protocol-consumer.lock.json is malformed:');
    for (const error of lockCheck.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  const result = verifyArtifactAgainstLock(artifact, lock);
  if (!result.valid) {
    console.error('Built tarball does not match protocol-consumer.lock.json:');
    for (const error of result.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Tarball artifact matches protocol-consumer.lock.json (commit ${lock.commit}, version ${lock.expectedVersion}, sha256 ${lock.tarball.sha256}).`);
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
