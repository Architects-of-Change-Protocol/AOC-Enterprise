import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAssuranceEvidenceResolver, type AssuranceRuntimeHealthSnapshot } from '../assurance/evidence-resolver.js';
import { deriveAssuranceMetrics } from '../assurance/metrics.js';
import { AssuranceError } from '../assurance/errors.js';
import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import type { AssuranceEvidenceReference, AssuranceEvidenceRequirement } from '../assurance/contracts.js';
import { ASSURANCE_CUTOFF, ASSURANCE_ORG, buildAssuranceClock, buildAssuranceIdGenerator, buildAttestation, buildTestScope } from './assurance-support.js';

const ATTEST_REQUIREMENT: AssuranceEvidenceRequirement = {
  requirementId: 'req.attest',
  description: 'attestation',
  acceptedEvidenceTypes: ['control_attestation'],
  minimumCount: 1,
  manualEvidenceAllowed: true,
  contradictionPolicy: 'manual_review',
};

function buildResolver(options: { manualEvidence?: readonly AssuranceEvidenceReference[]; sources?: Parameters<typeof createAssuranceEvidenceResolver>[0]['sources'] } = {}) {
  return createAssuranceEvidenceResolver({
    sources: options.sources ?? {},
    ...(options.manualEvidence !== undefined ? { manualEvidence: options.manualEvidence } : {}),
    now: buildAssuranceClock(),
    nextId: buildAssuranceIdGenerator(),
  });
}

describe('Assurance Evidence Resolver -- acceptance and rejection codes (mission sections 14-16/79)', () => {
  const scope = buildTestScope();

  it('accepts a verified, in-scope attestation and reports the requirement satisfied', async () => {
    const resolver = buildResolver({ manualEvidence: [buildAttestation('test.bool', true)] });
    const resolution = await resolver.resolve(scope, ATTEST_REQUIREMENT, ASSURANCE_ORG);
    assert.equal(resolution.status, 'satisfied');
    assert.equal(resolution.acceptedEvidence.length, 1);
    assert.deepEqual(resolution.rejectedEvidence, []);
    assert.deepEqual(resolution.missingEvidence, []);
  });

  it('rejects manual evidence when the requirement does not allow it (EVIDENCE_TYPE_NOT_ACCEPTED)', async () => {
    const resolver = buildResolver({ manualEvidence: [buildAttestation('test.bool', true)] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, manualEvidenceAllowed: false }, ASSURANCE_ORG);
    assert.equal(resolution.status, 'unsatisfied');
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_TYPE_NOT_ACCEPTED'));
  });

  it('rejects cross-tenant evidence (EVIDENCE_WRONG_TENANT)', async () => {
    const resolver = buildResolver({ manualEvidence: [buildAttestation('test.bool', true, { organizationId: 'org-2' })] });
    const resolution = await resolver.resolve(scope, ATTEST_REQUIREMENT, ASSURANCE_ORG);
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_WRONG_TENANT'));
  });

  it('rejects unverified evidence when the requirement demands verification (EVIDENCE_UNVERIFIED)', async () => {
    const resolver = buildResolver({ manualEvidence: [buildAttestation('test.bool', true, { verified: false })] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, mustBeVerified: true }, ASSURANCE_ORG);
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_UNVERIFIED'));
  });

  it('rejects stale evidence against the evidence cutoff, never the wall clock (EVIDENCE_TOO_OLD)', async () => {
    const old = buildAttestation('test.bool', true, { occurredAt: '2026-01-01T00:00:00.000Z' });
    const resolver = buildResolver({ manualEvidence: [old] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, maximumAgeDays: 30 }, ASSURANCE_ORG);
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_TOO_OLD'));
  });

  it('rejects evidence that post-dates the evidence cutoff (EVIDENCE_INCOMPLETE)', async () => {
    const future = buildAttestation('test.bool', true, { occurredAt: '2026-06-16T00:00:00.000Z' });
    const resolver = buildResolver({ manualEvidence: [future] });
    const resolution = await resolver.resolve(scope, ATTEST_REQUIREMENT, ASSURANCE_ORG);
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_INCOMPLETE'));
    assert.ok(resolution.rejectedEvidence[0]?.detail?.includes(ASSURANCE_CUTOFF));
  });

  it('rejects evidence not bound to the subject when mustReferenceSubject is set (EVIDENCE_WRONG_SUBJECT)', async () => {
    const other = buildAttestation('test.bool', true, { subjectId: 'someone-else' });
    const resolver = buildResolver({ manualEvidence: [other] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, mustReferenceSubject: true }, ASSURANCE_ORG);
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_WRONG_SUBJECT'));
  });

  it('rejects evidence with insufficient disclosure (EVIDENCE_DISCLOSURE_INSUFFICIENT)', async () => {
    const resolver = buildResolver({ manualEvidence: [buildAttestation('test.bool', true)] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, requiredDisclosureLevels: ['AUDITOR'] }, ASSURANCE_ORG);
    assert.ok(resolution.rejectedEvidence[0]?.reasonCodes.includes('EVIDENCE_DISCLOSURE_INSUFFICIENT'));
  });

  it('a rejected reference always carries one or more stable reason codes and a human-readable detail', async () => {
    const bad = buildAttestation('test.bool', true, { organizationId: 'org-2', verified: false });
    const resolver = buildResolver({ manualEvidence: [bad] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, mustBeVerified: true }, ASSURANCE_ORG);
    const rejected = resolution.rejectedEvidence[0];
    assert.ok(rejected);
    assert.ok(rejected.reasonCodes.length >= 2);
    assert.ok(rejected.detail);
  });

  it('reports partially_satisfied when accepted evidence is below minimumCount, with missing-evidence detail', async () => {
    const resolver = buildResolver({ manualEvidence: [buildAttestation('test.bool', true)] });
    const resolution = await resolver.resolve(scope, { ...ATTEST_REQUIREMENT, minimumCount: 3 }, ASSURANCE_ORG);
    assert.equal(resolution.status, 'partially_satisfied');
    assert.ok(resolution.missingEvidence[0]?.includes('at least 3'));
  });

  it('reports unavailable with EVIDENCE source detail when a required source is not wired', async () => {
    const resolver = buildResolver();
    const resolution = await resolver.resolve(scope, { requirementId: 'req.gov', description: 'governance', acceptedEvidenceTypes: ['governance_record'], minimumCount: 1 }, ASSURANCE_ORG);
    assert.equal(resolution.status, 'unavailable');
    assert.ok(resolution.missingEvidence.some((entry) => entry.includes('unavailable')));
  });

  it('reports unavailable when the governance source throws (EVIDENCE_SOURCE_UNAVAILABLE semantics)', async () => {
    const failingStore = { query: async () => Promise.reject(new Error('store down')) } as unknown as GovernanceStore;
    const resolver = buildResolver({ sources: { governanceStore: failingStore } });
    const resolution = await resolver.resolve(scope, { requirementId: 'req.gov', description: 'governance', acceptedEvidenceTypes: ['governance_record'], minimumCount: 1 }, ASSURANCE_ORG);
    assert.equal(resolution.status, 'unavailable');
  });

  it('detects contradictory evidence deterministically: one artifact, two digests', async () => {
    const first = buildAttestation('test.bool', true, { externalId: 'artifact-1', digest: `sha256:${'a'.repeat(64)}` });
    const second = buildAttestation('test.bool', false, { externalId: 'artifact-1', digest: `sha256:${'b'.repeat(64)}` });
    const resolver = buildResolver({ manualEvidence: [first, second] });
    const resolution = await resolver.resolve(scope, ATTEST_REQUIREMENT, ASSURANCE_ORG);
    assert.equal(resolution.contradictions.length, 1);
    assert.equal(resolution.contradictions[0]?.appliedPolicy, 'manual_review');
    assert.equal(resolution.contradictions[0]?.evidenceReferenceIds.length, 2);
  });

  it('enforces tenant scope: a non-system caller cannot resolve evidence for another organization', async () => {
    const resolver = buildResolver();
    await assert.rejects(
      () => resolver.resolve(scope, ATTEST_REQUIREMENT, { organizationId: 'org-2', system: false }),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ACCESS_SCOPE_VIOLATION',
    );
    await assert.rejects(
      () => resolver.resolve(scope, ATTEST_REQUIREMENT, { system: false }),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_TENANT_SCOPE_REQUIRED',
    );
  });
});

describe('Assurance Evidence Resolver -- runtime health and Passport evidence (mission section 79)', () => {
  const scope = buildTestScope();

  const snapshot: AssuranceRuntimeHealthSnapshot = {
    ready: true,
    lifecycleState: 'ready',
    modules: [
      { moduleId: 'aoc.kernel', version: '1.0.0', status: 'ready' },
      { moduleId: 'aoc.enterprise.events', version: '1.0.0', status: 'unhealthy' },
    ],
    observedAt: '2026-06-14T00:00:00.000Z',
  };

  it('resolves enterprise_health, module_health, and lifecycle_event evidence from the injected snapshot', async () => {
    const resolver = buildResolver({ sources: { runtimeHealth: async () => snapshot } });
    const health = await resolver.resolve(scope, { requirementId: 'req.health', description: 'health', acceptedEvidenceTypes: ['enterprise_health'] }, ASSURANCE_ORG);
    assert.equal(health.status, 'satisfied');
    assert.equal(health.acceptedEvidence[0]?.metadata?.ready, true);

    const modules = await resolver.resolve(scope, { requirementId: 'req.modules', description: 'modules', acceptedEvidenceTypes: ['module_health'] }, ASSURANCE_ORG);
    assert.equal(modules.acceptedEvidence.length, 2);

    const lifecycle = await resolver.resolve(scope, { requirementId: 'req.lifecycle', description: 'lifecycle', acceptedEvidenceTypes: ['lifecycle_event'] }, ASSURANCE_ORG);
    assert.equal(lifecycle.acceptedEvidence[0]?.externalId, 'lifecycle:ready');

    const metrics = deriveAssuranceMetrics([health, modules]);
    assert.equal(metrics['enterprise.ready'], true);
    assert.equal(metrics['modules.unhealthy_count'], 1);
  });

  it('resolves a real Agent Passport as evidence, including verification state and lifecycle metadata', async () => {
    const now = buildAssuranceClock();
    const passportStore = createInMemoryPassportStore({ now, nextId: buildAssuranceIdGenerator(), enterpriseVersion: 'test-1.0.0' });
    const { passport } = await passportStore.appendEvent(ASSURANCE_ORG, {
      passportId: 'passport-1',
      organizationId: 'org-1',
      eventType: 'AgentPassportCreated',
      payload: {
        subject: { agentId: 'agent-under-test', agentType: 'autonomous_agent' },
        organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-06-01T00:00:00.000Z' },
        passportVersion: '1.0.0',
      },
      actorId: 'user-1',
      actorType: 'user',
    });
    await passportStore.appendEvent(ASSURANCE_ORG, {
      passportId: passport.passportId,
      organizationId: 'org-1',
      eventType: 'AgentPassportActivated',
      payload: {},
      actorId: 'user-1',
      actorType: 'user',
    });

    const resolver = buildResolver({ sources: { passportStore } });
    const resolution = await resolver.resolve(
      scope,
      { requirementId: 'req.passport', description: 'passport', acceptedEvidenceTypes: ['agent_passport'], mustReferenceSubject: true },
      ASSURANCE_ORG,
    );
    assert.equal(resolution.status, 'satisfied');
    const reference = resolution.acceptedEvidence[0];
    assert.ok(reference);
    assert.equal(reference.evidenceType, 'agent_passport');
    assert.equal(reference.subjectId, 'agent-under-test');
    assert.equal(reference.verified, true);

    const metrics = deriveAssuranceMetrics([resolution]);
    assert.equal(metrics['passport.present'], true);
    assert.equal(metrics['passport.active'], true);
    assert.equal(metrics['passport.verified'], true);
    assert.equal(metrics['passport.lifecycle_valid'], true);
    assert.equal(metrics['passport.revoked'], false);
  });

  it('a metric that cannot be derived from accepted evidence is simply absent -- never silently false', () => {
    const metrics = deriveAssuranceMetrics([]);
    assert.equal(metrics['passport.present'], undefined);
    assert.equal(metrics['enterprise.ready'], undefined);
  });
});
