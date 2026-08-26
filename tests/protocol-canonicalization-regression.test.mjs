import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Frontera-side consumer regression for the burned @aoc/protocol@0.2.0-rc.0
// canonicalization defect. The assertions live in
// scripts/protocol/check-canonicalization-regression.mjs, which is the only
// place in this repository allowed to name a Protocol export subpath
// specifier (see that file's header for why); this test deliberately names
// none itself, so the forbidden-import scans stay blunt and load-bearing. It
// runs that probe as a blocking gate, so `npm test` fails if Frontera ever
// resolves the burned candidate again.
const root = process.cwd();

test('the installed @aoc/protocol has the repaired canonicalization (not burned rc.0)', () => {
  const result = spawnSync('node', [resolve(root, 'scripts/protocol/check-canonicalization-regression.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence['canonicalizeJSON(7.9e-10)'], '7.9e-10');
  assert.equal(evidence['canonicalizeJSON(7.9e-100)'], '7.9e-100');
  assert.equal(evidence.outputsDistinct, true);
  assert.equal(evidence.digestsDistinct, true);
  assert.equal(evidence.roundTrip, 'PASS');
  assert.deepEqual(evidence.failures, []);
});

test('the compatibility lock records the repaired candidate, and records rc.0 as burned', () => {
  const lock = JSON.parse(readFileSync(resolve(root, 'protocol-consumer.lock.json'), 'utf8'));

  assert.equal(lock.expectedVersion, '0.2.0-rc.1');
  assert.equal(lock.commit, 'eec79cdd4019dd42e1767909c5bd4e26d04c6f0f');
  assert.equal(lock.tarball.sha256, 'b0d6ee6ff2010c4addab0bd683e2a89b9b2246f430c7e892fdc3d4123f3a3f60');
  assert.equal(lock.integrationContract.contractVersion, '1.0.1');

  // The burned candidate must keep existing in the record by name and by
  // checksum. Erasing it would leave nothing in this repository explaining why
  // 0.2.0-rc.0 must never be reinstated.
  assert.equal(lock.supersedes.expectedVersion, '0.2.0-rc.0');
  assert.equal(lock.supersedes.status, 'BURNED');
  assert.equal(lock.supersedes.sha256, 'dbe8a08f432a0324ad34eb7cb85054b6dcd23c0d9a073914edf23fccd10445e5');
  assert.equal(lock.supersedes.supersedes.expectedVersion, '0.1.0');
});
