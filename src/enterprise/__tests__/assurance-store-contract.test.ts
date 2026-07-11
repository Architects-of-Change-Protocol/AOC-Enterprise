import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createInMemoryAssuranceStore } from '../assurance/in-memory-assurance-store.js';
import { createSqliteAssuranceStore } from '../assurance/sqlite-assurance-store.js';
import { AssuranceError } from '../assurance/errors.js';
import { buildFindingEvent } from '../assurance/findings.js';
import { computeDigest } from '../governance-store/digest.js';
import type { AssuranceStore } from '../assurance/assurance-store.js';
import type { AssuranceAssessment, AssuranceFinding, AssuranceSignal } from '../assurance/contracts.js';
import {
  ASSURANCE_ORG,
  ASSURANCE_ORG_2,
  ASSURANCE_SYSTEM,
  buildAssuranceClock,
  buildAssuranceHarness,
  buildAttestation,
  buildTestFramework,
  buildTestScope,
  buildTestSubject,
} from './assurance-support.js';

const closers: Array<() => Promise<void>> = [];
const tempDirs: string[] = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

let uniqueCounter = 0;
function uid(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}`;
}

/** A minimal but internally consistent assessment aggregate for store tests (content only -- integrity is exercised in the verification suite). */
function buildStoredAssessment(overrides: Partial<AssuranceAssessment> = {}): AssuranceAssessment {
  const assessmentId = overrides.assessmentId ?? uid('assessment');
  const subject = overrides.subject ?? buildTestSubject();
  const base: AssuranceAssessment = {
    assessmentId,
    assessmentVersion: '1.0.0',
    subject,
    scope: buildTestScope({ scopeId: uid('scope'), subject }),
    frameworkId: 'test.framework',
    frameworkVersion: '1.0.0',
    status: 'created',
    evidenceReferences: [buildAttestation('test.bool', true)],
    evidenceResolutions: [],
    controlEvaluations: [],
    findings: [],
    domainAssessments: [],
    score: { rawScore: 0, maximumScore: 0, normalizedScore: 0, domainScores: [], calculationTrace: [], methodologyId: 'test.scoring', methodologyVersion: '1.0.0', calculatedAt: 't' },
    eligibility: [],
    provenance: {
      requestedBy: 'assessor-1',
      organizationId: subject.organizationId,
      frameworkId: 'test.framework',
      frameworkVersion: '1.0.0',
      evidenceCutoffAt: '2026-06-15T00:00:00.000Z',
      evaluatorVersion: 'aoc.assurance-evaluator.v1',
      scoringVersion: 'aoc.assurance-scoring.v1',
      eligibilityVersion: 'aoc.assurance-eligibility.v1',
      enterpriseVersion: 'test-1.0.0',
      kernelVersion: '1.0.0',
      governanceStoreVersion: '1.0.0',
      evidenceRuntimeVersion: '1.0.0',
      moduleSnapshot: [],
      createdAt: '2026-06-15T00:00:00.000Z',
    },
    integrity: {
      algorithm: 'sha256',
      canonicalizationVersion: 'aoc.canonical-json.v1',
      scopeDigest: 'sha256:0',
      evidenceDigest: 'sha256:0',
      controlEvaluationsDigest: 'sha256:0',
      findingsDigest: 'sha256:0',
      domainAssessmentsDigest: 'sha256:0',
      scoreDigest: 'sha256:0',
      eligibilityDigest: 'sha256:0',
      assessmentDigest: 'sha256:0',
    },
    createdAt: '2026-06-15T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

function buildStoredFinding(assessmentId: string, overrides: Partial<AssuranceFinding> = {}): AssuranceFinding {
  return {
    findingId: uid('finding'),
    assessmentId,
    controlId: 'c.bool',
    domainId: 'd.core',
    findingType: 'control_failure',
    severity: 'high',
    status: 'open',
    title: 'Boolean control failed',
    description: 'test finding',
    reasonCodes: ['CONTROL_CRITERIA_UNMET'],
    evidenceReferenceIds: [],
    remediation: { objective: 'fix it', recommendedActions: ['fix'], requiredEvidence: [], priority: 'high' },
    createdAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

function buildStoredSignal(overrides: Partial<AssuranceSignal> = {}): AssuranceSignal {
  const base = {
    signalId: uid('signal'),
    organizationId: 'org-1',
    subjectType: 'agent',
    subjectId: 'agent-under-test',
    signalType: 'passport_suspended' as const,
    severity: 'high' as const,
    sourceType: 'agent_passport' as const,
    sourceId: 'passport-1',
    affectedControlIds: [],
    affectedDomainIds: [],
    occurredAt: '2026-06-16T00:00:00.000Z',
    observedAt: '2026-06-16T00:00:00.000Z',
    payload: {},
  };
  const merged = { ...base, ...overrides };
  return { ...merged, signalDigest: computeDigest(merged) };
}

interface Provider {
  readonly name: string;
  readonly build: () => Promise<AssuranceStore>;
}

const providers: readonly Provider[] = [
  { name: 'in-memory', build: async () => createInMemoryAssuranceStore({ now: buildAssuranceClock() }) },
  { name: 'sqlite (:memory:)', build: async () => createSqliteAssuranceStore(':memory:', { now: buildAssuranceClock() }) },
];

for (const provider of providers) {
  describe(`AssuranceStore contract -- ${provider.name} (mission sections 48-52/89)`, () => {
    async function open(): Promise<AssuranceStore> {
      const store = await provider.build();
      closers.push(() => store.close());
      return store;
    }

    it('persists framework definitions once, system-scope only, immutable per version', async () => {
      const store = await open();
      await store.saveFramework(ASSURANCE_SYSTEM, buildTestFramework());
      assert.equal((await store.getFramework(ASSURANCE_SYSTEM, 'test.framework', '1.0.0'))?.name, 'Test Assurance Framework');
      assert.equal((await store.listFrameworks(ASSURANCE_SYSTEM)).length, 1);
      await assert.rejects(
        () => store.saveFramework(ASSURANCE_SYSTEM, buildTestFramework()),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FRAMEWORK_INVALID',
      );
      await assert.rejects(
        () => store.saveFramework(ASSURANCE_ORG, buildTestFramework({ frameworkVersion: '9.9.9' })),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ACCESS_SCOPE_VIOLATION',
      );
    });

    it('saves, reads, and queries assessments within tenant scope', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, assessment);
      const loaded = await store.getAssessment(ASSURANCE_ORG, assessment.assessmentId);
      assert.equal(loaded?.assessmentId, assessment.assessmentId);

      const query = await store.queryAssessments(ASSURANCE_ORG, { subjectId: assessment.subject.subjectId });
      assert.equal(query.total, 1);
      assert.equal(query.assessments[0]?.assessmentId, assessment.assessmentId);
    });

    it('non-terminal snapshots may be re-saved; completed assessments are immutable', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, assessment);
      await store.saveAssessment(ASSURANCE_ORG, { ...assessment, status: 'collecting_evidence' });
      await store.saveAssessment(ASSURANCE_ORG, { ...assessment, status: 'completed', completedAt: '2026-06-15T01:00:00.000Z' });
      await assert.rejects(
        () => store.saveAssessment(ASSURANCE_ORG, { ...assessment, status: 'completed', completedAt: '2026-06-15T02:00:00.000Z' }),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ASSESSMENT_IMMUTABLE',
      );
    });

    it('markSuperseded is store-level bookkeeping over a completed assessment; content stays frozen', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, { ...assessment, status: 'completed', completedAt: 't' });
      await store.markSuperseded(ASSURANCE_ORG, assessment.assessmentId, 'assessment-next');
      const superseded = await store.getAssessment(ASSURANCE_ORG, assessment.assessmentId);
      assert.equal(superseded?.status, 'superseded');
      assert.equal(superseded?.supersededByAssessmentId, 'assessment-next');
      assert.deepEqual(superseded?.evidenceReferences, assessment.evidenceReferences, 'frozen content is unchanged');

      const inProgress = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, inProgress);
      await assert.rejects(
        () => store.markSuperseded(ASSURANCE_ORG, inProgress.assessmentId, 'x'),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ASSESSMENT_IMMUTABLE',
      );
    });

    it('appends finding events with contiguous sequences and valid transitions only; history folds into current status', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      const finding = buildStoredFinding(assessment.assessmentId);
      await store.saveAssessment(ASSURANCE_ORG, { ...assessment, findings: [finding], status: 'completed', completedAt: 't' });

      const eventBase = { findingId: finding.findingId, assessmentId: assessment.assessmentId, organizationId: 'org-1', actorId: 'user-1', occurredAt: 't' };
      await store.appendFindingEvent(ASSURANCE_ORG, buildFindingEvent({ ...eventBase, findingEventId: uid('finding-event'), eventType: 'AssuranceFindingCreated', sequence: 1 }));
      await store.appendFindingEvent(ASSURANCE_ORG, buildFindingEvent({ ...eventBase, findingEventId: uid('finding-event'), eventType: 'AssuranceFindingAccepted', sequence: 2 }));

      await assert.rejects(
        () => store.appendFindingEvent(ASSURANCE_ORG, buildFindingEvent({ ...eventBase, findingEventId: uid('finding-event'), eventType: 'AssuranceFindingReopened', sequence: 3 })),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_INVALID_FINDING_TRANSITION',
        'accepted -> reopened is invalid: only closed/remediated/superseded findings reopen',
      );
      await assert.rejects(
        () => store.appendFindingEvent(ASSURANCE_ORG, buildFindingEvent({ ...eventBase, findingEventId: uid('finding-event'), eventType: 'AssuranceFindingRemediated', sequence: 9 })),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_INVALID_FINDING_TRANSITION',
        'sequence must be contiguous',
      );

      const events = await store.listFindingEvents(ASSURANCE_ORG, finding.findingId);
      assert.equal(events.length, 2, 'rejected events were never appended');

      const findings = await store.listFindings(ASSURANCE_ORG, assessment.assessmentId);
      assert.equal(findings[0]?.status, 'accepted', 'the stored finding reports its event-folded status');
    });

    it('finding events for an unknown finding are rejected (ASSURANCE_FINDING_NOT_FOUND)', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, assessment);
      await assert.rejects(
        () =>
          store.appendFindingEvent(
            ASSURANCE_ORG,
            buildFindingEvent({
              findingEventId: uid('finding-event'),
              findingId: 'finding-missing',
              assessmentId: assessment.assessmentId,
              organizationId: 'org-1',
              eventType: 'AssuranceFindingCreated',
              sequence: 1,
              actorId: 'user-1',
              occurredAt: 't',
            }),
          ),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FINDING_NOT_FOUND',
      );
    });

    it('appends manual reviews once (duplicate review ids rejected) and lists them per assessment', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, assessment);
      const review = {
        reviewId: uid('review'),
        assessmentId: assessment.assessmentId,
        controlId: 'c.manual',
        reviewerId: 'human-1',
        reviewerRole: 'reviewer',
        outcome: 'pass' as const,
        rationale: 'checked',
        evidenceReferenceIds: [],
        reviewedAt: 't',
        reviewDigest: 'sha256:0',
      };
      await store.appendManualReview(ASSURANCE_ORG, review);
      await assert.rejects(
        () => store.appendManualReview(ASSURANCE_ORG, review),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_MANUAL_REVIEW_INVALID',
      );
      const reviews = await store.listManualReviews(ASSURANCE_ORG, assessment.assessmentId);
      assert.equal(reviews.length, 1);
      assert.equal(reviews[0]?.reviewerId, 'human-1');
    });

    it('appends signals once and lists them by subject/type/time within tenant scope', async () => {
      const store = await open();
      const signal = buildStoredSignal();
      await store.appendSignal(ASSURANCE_ORG, signal);
      await assert.rejects(
        () => store.appendSignal(ASSURANCE_ORG, signal),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_SIGNAL_INVALID',
      );
      const listed = await store.listSignals(ASSURANCE_ORG, { subjectId: 'agent-under-test', signalType: 'passport_suspended' });
      assert.equal(listed.length, 1);
      assert.equal((await store.listSignals(ASSURANCE_ORG_2, { subjectId: 'agent-under-test' })).length, 0, 'signals never cross tenant scope');
    });

    it('enforces tenant isolation on every read and write surface', async () => {
      const store = await open();
      const assessment = buildStoredAssessment();
      await store.saveAssessment(ASSURANCE_ORG, assessment);

      assert.equal(await store.getAssessment(ASSURANCE_ORG_2, assessment.assessmentId), null);
      assert.equal((await store.queryAssessments(ASSURANCE_ORG_2, {})).total, 0);
      assert.deepEqual(await store.listFindings(ASSURANCE_ORG_2, assessment.assessmentId), []);
      assert.deepEqual(await store.listManualReviews(ASSURANCE_ORG_2, assessment.assessmentId), []);
      await assert.rejects(
        () => store.saveAssessment(ASSURANCE_ORG_2, buildStoredAssessment({ subject: buildTestSubject() })),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ACCESS_SCOPE_VIOLATION',
      );
      await assert.rejects(() => store.queryAssessments({ system: false }, {}), (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_TENANT_SCOPE_REQUIRED');
      // System access is explicit and sees across organizations.
      assert.equal((await store.queryAssessments(ASSURANCE_SYSTEM, {})).total, 1);
    });

    it('the same subject id in two organizations stays fully isolated', async () => {
      const store = await open();
      const first = buildStoredAssessment({ subject: buildTestSubject() });
      const second = buildStoredAssessment({ subject: buildTestSubject({ organizationId: 'org-2' }), scope: buildTestScope({ subject: buildTestSubject({ organizationId: 'org-2' }) }) });
      await store.saveAssessment(ASSURANCE_ORG, first);
      await store.saveAssessment(ASSURANCE_ORG_2, second);
      const org1 = await store.queryAssessments(ASSURANCE_ORG, { subjectId: 'agent-under-test' });
      const org2 = await store.queryAssessments(ASSURANCE_ORG_2, { subjectId: 'agent-under-test' });
      assert.equal(org1.total, 1);
      assert.equal(org2.total, 1);
      assert.notEqual(org1.assessments[0]?.assessmentId, org2.assessments[0]?.assessmentId);
    });

    it('reports health and rejects use after close', async () => {
      const store = await provider.build();
      const health = await store.health();
      assert.equal(health.status, 'healthy');
      assert.equal(health.schemaVersion, 'aoc.assurance-store.schema.v1');
      await store.close();
      await assert.rejects(
        () => store.getAssessment(ASSURANCE_ORG, 'x'),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_STORE_UNAVAILABLE',
      );
    });
  });
}

describe('SQLite Assurance Store -- persistence across reopen (mission section 89)', () => {
  it('assessments, findings, reviews, and signals survive a close/reopen cycle on the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'assurance-store-'));
    tempDirs.push(dir);
    const path = join(dir, 'assurance.sqlite');

    const first = await createSqliteAssuranceStore(path, { now: buildAssuranceClock() });
    const assessment = buildStoredAssessment();
    const finding = buildStoredFinding(assessment.assessmentId);
    await first.saveFramework(ASSURANCE_SYSTEM, buildTestFramework());
    await first.saveAssessment(ASSURANCE_ORG, { ...assessment, findings: [finding], status: 'completed', completedAt: 't' });
    await first.appendSignal(ASSURANCE_ORG, buildStoredSignal());
    await first.close();

    const second = await createSqliteAssuranceStore(path, { now: buildAssuranceClock() });
    closers.push(() => second.close());
    const reloaded = await second.getAssessment(ASSURANCE_ORG, assessment.assessmentId);
    assert.equal(reloaded?.status, 'completed');
    assert.equal((await second.listFindings(ASSURANCE_ORG, assessment.assessmentId)).length, 1);
    assert.equal((await second.listSignals(ASSURANCE_ORG, {})).length, 1);
    assert.equal((await second.listFrameworks(ASSURANCE_SYSTEM)).length, 1);
    // Immutability survives reopen too.
    await assert.rejects(
      () => second.saveAssessment(ASSURANCE_ORG, { ...assessment, status: 'completed', completedAt: 'later' }),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ASSESSMENT_IMMUTABLE',
    );
  });
});

describe('AssuranceStore -- verification pathway (mission section 89)', () => {
  it('verifyAssessment reproduces a service-built completed assessment against the persisted framework', async () => {
    const harness = buildAssuranceHarness();
    await harness.store.saveFramework(ASSURANCE_SYSTEM, buildTestFramework());
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
    await harness.service.completeAssessment(ASSURANCE_ORG, created.assessmentId);

    const verification = await harness.store.verifyAssessment(ASSURANCE_ORG, created.assessmentId);
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
  });
});
