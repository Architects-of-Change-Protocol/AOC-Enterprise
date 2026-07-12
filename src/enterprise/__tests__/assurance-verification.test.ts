import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { verifyAssuranceAssessment } from '../assurance/verification.js';
import { buildTestFramework } from './assurance-support.js';
import {
  ASSURANCE_ORG,
  buildAssuranceHarness,
  buildAttestation,
  buildTestSubject,
} from './assurance-support.js';
import type { AssuranceAssessment, AssuranceFramework } from '../assurance/contracts.js';

const framework: AssuranceFramework = buildTestFramework();
let completed: AssuranceAssessment;

before(async () => {
  const harness = buildAssuranceHarness();
  const created = await harness.service.createAssessment(ASSURANCE_ORG, {
    subject: buildTestSubject(),
    frameworkId: 'test.framework',
    frameworkVersion: '1.0.0',
    requestedBy: 'assessor-1',
    evidenceCutoffAt: '2026-06-15T00:00:00.000Z',
  });
  await harness.service.collectEvidence(ASSURANCE_ORG, created.assessmentId, {
    manualEvidence: [buildAttestation('test.bool', true), buildAttestation('test.count', 3), buildAttestation('test.agent', true)],
  });
  await harness.service.evaluateAssessment(ASSURANCE_ORG, created.assessmentId);
  completed = await harness.service.completeAssessment(ASSURANCE_ORG, created.assessmentId);
});

function verify(assessment: AssuranceAssessment, verifyFramework: AssuranceFramework | undefined = framework) {
  return verifyAssuranceAssessment({ assessment, ...(verifyFramework !== undefined ? { framework: verifyFramework } : {}), now: () => '2026-07-01T00:00:00.000Z' });
}

describe('Assurance assessment verification (mission sections 64-65/87)', () => {
  it('a valid completed assessment verifies with every check true (no false positives)', () => {
    const result = verify(completed);
    assert.equal(result.valid, true, JSON.stringify(result.failures));
    assert.deepEqual(Object.values(result.checks), Object.values(result.checks).map(() => true));
    assert.deepEqual(result.failures, []);
  });

  it('a modified scope is detected', () => {
    const tampered = { ...completed, scope: { ...completed.scope, evidenceCutoffAt: '2027-01-01T00:00:00.000Z' } };
    const result = verify(tampered);
    assert.equal(result.valid, false);
    assert.equal(result.checks.scope, false);
  });

  it('modified evidence references are detected', () => {
    const tampered = { ...completed, evidenceReferences: completed.evidenceReferences.map((reference) => ({ ...reference, verified: true, digest: `sha256:${'f'.repeat(64)}` })) };
    const result = verify(tampered);
    assert.equal(result.checks.evidence, false);
  });

  it('a cross-tenant evidence reference is detected even when digests are recomputed to match', () => {
    const foreign = buildAttestation('x', true, { organizationId: 'org-2' });
    const tampered = { ...completed, evidenceReferences: [...completed.evidenceReferences, foreign] };
    const result = verify(tampered);
    assert.equal(result.checks.evidence, false);
    assert.ok(result.failures.some((failure) => failure.message.includes("organization 'org-2'")));
  });

  it('a modified control result is detected both by digest and by calculation reproduction', () => {
    const tampered = {
      ...completed,
      controlEvaluations: completed.controlEvaluations.map((evaluation) => (evaluation.controlId === 'c.bool' ? { ...evaluation, status: 'fail' as const } : evaluation)),
    };
    const result = verify(tampered);
    assert.equal(result.checks.controls, false);
    assert.equal(result.checks.domains, false, 'the domain score no longer reproduces from the tampered control results');
  });

  it('a modified finding is detected', () => {
    assert.ok(completed.findings.length > 0, 'the pending manual review produced a finding');
    const tampered = { ...completed, findings: completed.findings.map((finding) => ({ ...finding, severity: 'critical' as const, title: 'tampered' })) };
    const result = verify(tampered);
    assert.equal(result.checks.findings, false);
  });

  it('a modified domain score is detected', () => {
    const tampered = { ...completed, domainAssessments: completed.domainAssessments.map((domain) => ({ ...domain, normalizedScore: 12.34, score: 0.1 })) };
    const result = verify(tampered);
    assert.equal(result.checks.domains, false);
  });

  it('a modified overall score is detected', () => {
    const tampered = { ...completed, score: { ...completed.score, normalizedScore: 99.99 } };
    const result = verify(tampered);
    assert.equal(result.checks.score, false);
  });

  it('a modified eligibility result is detected', () => {
    const tampered = { ...completed, eligibility: completed.eligibility.map((result) => ({ ...result, eligible: true, provisional: false })) };
    const result = verify(tampered);
    assert.equal(result.checks.eligibility, false);
  });

  it('a wrong framework version fails the framework check', () => {
    const result = verify(completed, buildTestFramework({ frameworkVersion: '2.0.0' }));
    assert.equal(result.checks.framework, false);
  });

  it('a missing framework fails the framework check explicitly rather than being assumed valid', () => {
    const result = verifyAssuranceAssessment({ assessment: completed, now: () => '2026-07-01T00:00:00.000Z' });
    assert.equal(result.checks.framework, false);
    assert.ok(result.failures.some((failure) => failure.message.includes('not registered')));
  });

  it('a tampered assessment digest itself is detected', () => {
    const tampered = { ...completed, integrity: { ...completed.integrity, assessmentDigest: `sha256:${'0'.repeat(64)}` } };
    const result = verify(tampered);
    assert.equal(result.checks.integrity, false);
  });
});
