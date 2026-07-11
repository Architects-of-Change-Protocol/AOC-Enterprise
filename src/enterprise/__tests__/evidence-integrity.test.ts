import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import type { GovernanceRecord } from '../governance-store/contracts.js';
import { buildEvidenceBundle } from '../evidence/projector.js';
import { verifyEvidenceBundle } from '../evidence/verifier.js';
import { AUDITOR_DISCLOSURE_POLICY, FULL_DISCLOSURE_POLICY, PUBLIC_DISCLOSURE_POLICY } from '../evidence/disclosure-policies.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

const SYSTEM = { system: true } as const;
const openEnterprises: AocEnterprise[] = [];

after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
});

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
const now = () => '2026-01-01T00:00:00.000Z';

async function buildRealRecord(requestId: string): Promise<GovernanceRecord> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId }));
  assert.equal(outcome.body.status, 'allowed');
  const record = await enterprise.persistence.getByRequestId(SYSTEM, requestId);
  assert.ok(record);
  return record;
}

describe('Evidence Bundle integrity', () => {
  it('recordDigest is carried verbatim from the Governance Record -- never recomputed, only projected', async () => {
    const record = await buildRealRecord('req-integrity-record-digest');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    assert.equal(bundle.integrity.recordDigest, record.integrity.aggregateDigest);
  });

  it('a well-formed sha256 digest is produced for bundleDigest and verificationDigest', async () => {
    const record = await buildRealRecord('req-integrity-format');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    assert.match(bundle.integrity.bundleDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(bundle.integrity.verificationDigest, /^sha256:[0-9a-f]{64}$/);
  });

  it('bundleDigest changes when the projected content changes (different disclosure policy), while recordDigest does not', async () => {
    const record = await buildRealRecord('req-integrity-projection-changes');
    const fullBundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    const publicBundle = buildEvidenceBundle(record, PUBLIC_DISCLOSURE_POLICY, { now, nextId });

    assert.notEqual(fullBundle.integrity.bundleDigest, publicBundle.integrity.bundleDigest);
    assert.equal(fullBundle.integrity.recordDigest, publicBundle.integrity.recordDigest);
    assert.notEqual(fullBundle.integrity.verificationDigest, publicBundle.integrity.verificationDigest);
  });

  it('two Bundles built from two different Governance Records never collide on bundleDigest or recordDigest', async () => {
    const recordA = await buildRealRecord('req-integrity-record-a');
    const recordB = await buildRealRecord('req-integrity-record-b');
    const bundleA = buildEvidenceBundle(recordA, FULL_DISCLOSURE_POLICY, { now, nextId });
    const bundleB = buildEvidenceBundle(recordB, FULL_DISCLOSURE_POLICY, { now, nextId });

    assert.notEqual(bundleA.integrity.bundleDigest, bundleB.integrity.bundleDigest);
    assert.notEqual(bundleA.integrity.recordDigest, bundleB.integrity.recordDigest);
  });

  it('tampering with a Bundle after it was built is detected by the Verifier', async () => {
    const record = await buildRealRecord('req-integrity-tamper');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });

    const tampered = { ...bundle, evidence: { ...bundle.evidence, summary: 'a forged summary' } };
    const result = verifyEvidenceBundle(tampered, { record, now });

    assert.equal(result.valid, false);
    assert.equal(result.checks.bundleDigest, false);
    assert.ok(result.failures.some((failure) => failure.check === 'bundleDigest'));
  });
});

describe('Evidence Bundle verification', () => {
  it('a genuinely valid Bundle verifies successfully against its source Governance Record', async () => {
    const record = await buildRealRecord('req-verify-valid');
    const bundle = buildEvidenceBundle(record, AUDITOR_DISCLOSURE_POLICY, { now, nextId });

    const result = verifyEvidenceBundle(bundle, { record, now });

    assert.equal(result.valid, true);
    assert.equal(result.checks.bundleDigest, true);
    assert.equal(result.checks.verificationDigest, true);
    assert.equal(result.checks.recordDigest, true);
    assert.equal(result.checks.policyMatch, true);
    assert.equal(result.checks.versionSupported, true);
    assert.equal(result.checks.complete, true);
    assert.deepEqual(result.failures, []);
  });

  it('an invalid (digest-mutated) Bundle fails verification with a specific failure', async () => {
    const record = await buildRealRecord('req-verify-invalid-digest');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    const corrupted = { ...bundle, integrity: { ...bundle.integrity, bundleDigest: 'sha256:' + '0'.repeat(64) } };

    const result = verifyEvidenceBundle(corrupted, { record, now });

    assert.equal(result.valid, false);
    assert.equal(result.checks.bundleDigest, false);
  });

  it('a corrupted/incomplete Bundle (missing a field its own policy requires) fails the completeness check', async () => {
    const record = await buildRealRecord('req-verify-incomplete');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    const { summary: _summary, ...evidenceWithoutSummary } = bundle.evidence;
    const incomplete = { ...bundle, evidence: evidenceWithoutSummary };

    const result = verifyEvidenceBundle(incomplete, { record, now });

    assert.equal(result.checks.complete, false);
    assert.equal(result.valid, false);
  });

  it('a Bundle claiming an unsupported bundleVersion fails the version check', async () => {
    const record = await buildRealRecord('req-verify-wrong-version');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    const wrongVersion = { ...bundle, bundleVersion: 'evidence.bundle.v99' };

    const result = verifyEvidenceBundle(wrongVersion, { record, now });

    assert.equal(result.checks.versionSupported, false);
    assert.equal(result.valid, false);
  });

  it('a Bundle whose recordDigest does not match the supplied Governance Record fails the record check', async () => {
    const recordA = await buildRealRecord('req-verify-wrong-record-a');
    const recordB = await buildRealRecord('req-verify-wrong-record-b');
    const bundle = buildEvidenceBundle(recordA, FULL_DISCLOSURE_POLICY, { now, nextId });

    const result = verifyEvidenceBundle(bundle, { record: recordB, now });

    assert.equal(result.checks.recordDigest, false);
    assert.equal(result.valid, false);
  });

  it('verification without a supplied Governance Record still checks structural validity, leaving recordDigest explicitly unanswered', async () => {
    const record = await buildRealRecord('req-verify-no-record');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });

    const result = verifyEvidenceBundle(bundle, { now });

    assert.equal(result.checks.recordDigest, undefined);
    assert.equal(result.checks.bundleDigest, true);
    assert.equal(result.valid, true);
  });

  it('a Bundle claiming a policyId/version that does not match the registered policy fails policyMatch', async () => {
    const record = await buildRealRecord('req-verify-policy-mismatch');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now, nextId });
    const mismatched = { ...bundle, disclosure: { ...bundle.disclosure, policyVersion: '9.9.9' } };

    const result = verifyEvidenceBundle(mismatched, { record, now });

    assert.equal(result.checks.policyMatch, false);
    assert.equal(result.valid, false);
  });
});
