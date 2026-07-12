import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ASSURANCE_SIGNAL_OUTCOMES, ASSURANCE_SIGNAL_SEVERITIES, buildAssuranceSignal, deriveContinuousAssuranceState, deriveStaleReasons } from '../assurance/signals.js';
import { AssuranceError } from '../assurance/errors.js';
import { ASSURANCE_SIGNAL_TYPES } from '../assurance/contracts.js';
import {
  ASSURANCE_ORG,
  buildAssuranceHarness,
  buildAttestation,
  buildTestSubject,
  type AssuranceTestHarness,
} from './assurance-support.js';
import type { AssuranceAssessment, AssuranceSignalType } from '../assurance/contracts.js';
import type { BuildAssuranceSignalInput } from '../assurance/signals.js';

function signalInput(signalType: AssuranceSignalType, overrides: Partial<Omit<BuildAssuranceSignalInput, 'signalId'>> = {}): Omit<BuildAssuranceSignalInput, 'signalId'> {
  return {
    organizationId: 'org-1',
    subjectType: 'agent',
    subjectId: 'agent-under-test',
    signalType,
    sourceType: 'agent_passport',
    sourceId: 'passport-1',
    occurredAt: '2026-06-16T00:00:00.000Z',
    observedAt: '2026-06-16T00:00:00.000Z',
    ...overrides,
  };
}

async function completeAssessment(harness: AssuranceTestHarness): Promise<AssuranceAssessment> {
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
  return harness.service.completeAssessment(ASSURANCE_ORG, created.assessmentId);
}

describe('Continuous Assurance signals -- catalog and construction (mission sections 41-43/86)', () => {
  it('every supported signal type has a deterministic default severity and outcome set', () => {
    for (const signalType of ASSURANCE_SIGNAL_TYPES) {
      assert.ok(ASSURANCE_SIGNAL_SEVERITIES[signalType], `severity for ${signalType}`);
      assert.ok(ASSURANCE_SIGNAL_OUTCOMES[signalType].length > 0, `outcomes for ${signalType}`);
    }
  });

  it('signals carry a deterministic digest over their content and reject unsupported types', () => {
    const first = buildAssuranceSignal({ signalId: 'signal-1', ...signalInput('passport_revoked') });
    const second = buildAssuranceSignal({ signalId: 'signal-1', ...signalInput('passport_revoked') });
    assert.equal(first.signalDigest, second.signalDigest);
    assert.equal(first.severity, 'critical', 'passport_revoked defaults to critical');
    assert.throws(
      () => buildAssuranceSignal({ signalId: 'signal-2', ...signalInput('every_log_line' as AssuranceSignalType) }),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_SIGNAL_INVALID',
    );
  });
});

describe('Continuous Assurance -- signal processing (mission sections 43-45/86)', () => {
  it('passport_revoked marks the latest completed assessment stale, suspends derived eligibility, and recommends reassessment -- without rewriting the stored assessment', async () => {
    const harness = buildAssuranceHarness();
    const completed = await completeAssessment(harness);
    const digestBefore = completed.integrity.assessmentDigest;

    const result = await harness.service.processSignal(ASSURANCE_ORG, signalInput('passport_revoked'));
    assert.deepEqual(result.outcomes, ['mark_assessment_stale', 'change_eligibility', 'request_reassessment']);
    assert.deepEqual(result.affectedAssessmentIds, [completed.assessmentId]);
    assert.ok(result.detail.includes('never runs it automatically'));

    const stored = await harness.service.getAssessment(ASSURANCE_ORG, completed.assessmentId);
    assert.equal(stored?.status, 'completed', 'the historical assessment is unchanged');
    assert.equal(stored?.integrity.assessmentDigest, digestBefore);

    const state = await harness.service.getContinuousState(ASSURANCE_ORG, 'agent-under-test');
    assert.equal(state.state, 'critical');
    assert.equal(state.eligibilityState, 'suspended_by_signal');
    assert.ok(state.staleReasons.length > 0);
    assert.equal(state.latestCompletedAssessmentId, completed.assessmentId);
  });

  it('control_evidence_missing opens a finding on the latest completed assessment through the append-only lifecycle', async () => {
    const harness = buildAssuranceHarness();
    const completed = await completeAssessment(harness);
    const before = (await harness.service.listFindings(ASSURANCE_ORG, completed.assessmentId)).length;

    const result = await harness.service.processSignal(ASSURANCE_ORG, signalInput('control_evidence_missing', { affectedControlIds: ['c.bool'], severity: 'medium' }));
    assert.ok(result.outcomes.includes('open_finding'));

    const findings = await harness.service.listFindings(ASSURANCE_ORG, completed.assessmentId);
    assert.equal(findings.length, before + 1);
    const opened = findings.find((finding) => finding.reasonCodes.includes('SIGNAL_CONTROL_EVIDENCE_MISSING'));
    assert.ok(opened);
    assert.equal(opened?.status, 'open');
    assert.equal(opened?.controlId, 'c.bool');
  });

  it('finding_reopened reopens a closed finding via its event history', async () => {
    const harness = buildAssuranceHarness();
    const completed = await completeAssessment(harness);
    // The provisional completion left the manual-review finding open; walk it to remediated then reopen by signal.
    const findings = await harness.service.listFindings(ASSURANCE_ORG, completed.assessmentId);
    const finding = findings[0];
    assert.ok(finding, 'the manual-review control produced a finding');
    await harness.service.appendFindingEvent(ASSURANCE_ORG, { findingId: finding.findingId, eventType: 'AssuranceFindingRemediated', actorId: 'user-1' });

    const result = await harness.service.processSignal(ASSURANCE_ORG, signalInput('finding_reopened', { payload: { findingId: finding.findingId } }));
    assert.ok(result.outcomes.includes('reopen_finding'));

    const reopened = await harness.service.listFindings(ASSURANCE_ORG, completed.assessmentId);
    assert.equal(reopened.find((entry) => entry.findingId === finding.findingId)?.status, 'open');
  });

  it('a signal for a subject with no completed assessment is recorded for the next assessment', async () => {
    const harness = buildAssuranceHarness();
    const result = await harness.service.processSignal(ASSURANCE_ORG, signalInput('governance_decision_denied', { severity: 'informational' }));
    assert.deepEqual(result.outcomes, ['record_only']);
    assert.deepEqual(result.affectedAssessmentIds, []);
    assert.ok(result.detail.includes('No completed assessment'));
  });

  it('cross-tenant signals are rejected', async () => {
    const harness = buildAssuranceHarness();
    await assert.rejects(
      () => harness.service.processSignal({ organizationId: 'org-2', system: false }, signalInput('passport_suspended')),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_ACCESS_SCOPE_VIOLATION',
    );
  });
});

describe('Continuous Assurance -- derived state and staleness (mission sections 44-45/86)', () => {
  it('staleness derives only from stale-marking signals observed after completion; stale never means failed', async () => {
    const harness = buildAssuranceHarness();
    const completed = await completeAssessment(harness);

    const before = buildAssuranceSignal({
      signalId: 'signal-before',
      ...signalInput('passport_suspended', { occurredAt: '2026-01-01T00:00:00.000Z', observedAt: '2026-01-01T00:00:00.000Z' }),
    });
    assert.deepEqual(deriveStaleReasons(completed, [before]), [], 'signals observed before completion do not mark the assessment stale');

    const after = buildAssuranceSignal({ signalId: 'signal-after', ...signalInput('control_evidence_expired', { observedAt: '2026-07-01T00:00:00.000Z' }) });
    const reasons = deriveStaleReasons(completed, [after]);
    assert.equal(reasons.length, 1);
    assert.ok(reasons[0]?.includes('control_evidence_expired'));

    const recordOnly = buildAssuranceSignal({ signalId: 'signal-info', ...signalInput('governance_decision_denied', { observedAt: '2026-07-01T00:00:00.000Z' }) });
    assert.deepEqual(deriveStaleReasons(completed, [recordOnly]), [], 'record-only signals never mark staleness');
  });

  it('continuous state priority: unknown (no assessment) < current < stale < degraded < critical', async () => {
    const harness = buildAssuranceHarness();
    const noAssessment = deriveContinuousAssuranceState({
      subjectId: 'agent-x',
      frameworkId: 'test.framework',
      frameworkVersion: '1.0.0',
      openFindings: [],
      signals: [],
      now: () => 't',
    });
    assert.equal(noAssessment.state, 'unknown');

    const completed = await completeAssessment(harness);
    const currentState = await harness.service.getContinuousState(ASSURANCE_ORG, 'agent-under-test');
    assert.ok(currentState.state === 'current' || currentState.state === 'degraded', 'with only the open manual-review finding the state is not critical/stale');

    await harness.service.processSignal(ASSURANCE_ORG, signalInput('control_evidence_expired', { severity: 'medium', observedAt: '2026-07-01T00:00:00.000Z' }));
    const staleState = await harness.service.getContinuousState(ASSURANCE_ORG, 'agent-under-test');
    assert.equal(staleState.state, 'stale');

    await harness.service.processSignal(ASSURANCE_ORG, signalInput('enterprise_readiness_lost', { sourceType: 'enterprise_health', sourceId: 'enterprise', observedAt: '2026-07-02T00:00:00.000Z' }));
    const degradedState = await harness.service.getContinuousState(ASSURANCE_ORG, 'agent-under-test');
    assert.equal(degradedState.state, 'degraded');

    await harness.service.processSignal(ASSURANCE_ORG, signalInput('passport_integrity_failed', { observedAt: '2026-07-03T00:00:00.000Z' }));
    const criticalState = await harness.service.getContinuousState(ASSURANCE_ORG, 'agent-under-test');
    assert.equal(criticalState.state, 'critical');
    assert.equal(criticalState.latestCompletedAssessmentId, completed.assessmentId);
    assert.ok(criticalState.activeSignalIds.length >= 3);
  });
});
