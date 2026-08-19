#!/usr/bin/env node
// Validates the format and internal consistency of protocol-consumer.lock.json.
// This is NOT an npm lockfile -- it is a small, auditable record of which
// Soberanía Protocol commit/artifact Soberanía Enterprise has actually been validated
// against (see docs/integration/PROTOCOL_PACKAGE_CONSUMPTION.md).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateCompatibilityLock } from './lib-protocol-artifact.mjs';

const LOCK_PATH = resolve(process.cwd(), 'protocol-consumer.lock.json');

async function main() {
  if (!existsSync(LOCK_PATH)) {
    console.error(`Missing ${LOCK_PATH}. Run scripts/protocol/build-protocol-tarball.mjs and scripts/protocol/validate-enterprise-against-protocol-tarball.mjs, then record the result here.`);
    process.exitCode = 1;
    return;
  }

  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
  } catch (error) {
    console.error(`protocol-consumer.lock.json is not valid JSON: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { valid, errors } = validateCompatibilityLock(lock);
  if (!valid) {
    console.error('protocol-consumer.lock.json failed validation:');
    for (const error of errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`protocol-consumer.lock.json is valid: ${lock.package}@${lock.expectedVersion} pinned to commit ${lock.commit}.`);
}

main();
