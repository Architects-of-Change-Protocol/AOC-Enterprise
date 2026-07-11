import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyFindingTransition, buildFindingEvent, deriveFindingSeverity, deriveFindingsFromEvaluations, foldFindingStatus } from '../assurance/findings.js';
import { AssuranceError } from '../assurance/errors.js';
import { buildTestFramework } from './assurance-support.js';
import type { AssuranceControlEvaluation, AssuranceControlStatus, AssuranceFindingEvent, AssuranceFindingEventType } from '../assurance/contracts.js';

const framework = buildTestFramework();

function evaluation(controlId: string, domainId: string, status: AssuranceControlStatus, reasonCodes: readonly string[] = []): AssuranceControlEvaluation {
  return {
    controlEvaluationId: `eval-${controlId}-${status}`,
    assessmentId: 'assessment-1',
    controlId,
    controlVersion: '1.0.0',
    domainId,
    status,
    score: 0,
    maximumScore: 100,
    confidence: 'high',
    evidenceReferenceIds: ['attest-1'],
    rejectedEvidenceReferenceIds: [],
    criteriaResults: [],
    reasonCodes,
    summary: `${controlId} is ${status}`,
    evaluatedAt: '2026-06-15T00:00:00.000Z',
    evaluatorVersion: 'aoc.assurance-evaluator.v1',
  };
}

function derive(evaluations: readonly AssuranceControlEvaluation[]) {
  let counter = 0;
  return deriveFindingsFromEvaluations({
    framework,
    evaluations,
    assessmentId: 'assessment-1',
    nextId: (prefix) => `${prefix}-${(counter += 1)}`,
    now: () => '2026-06-15T00:00:00.000Z',
  });
}

describe('Assurance findings -- derivation and severity rules (mission sections 22-23/81)', () => {
  it('fail/partial/unknown/manual_review_required produce findings; pass and not_applicable never do', () => {
    const findings = derive([
      evaluation('c.bool', 'd.core', 'pass'),
      evaluation('c.threshold', 'd.core', 'fail'),
      evaluation('c.presence', 'd.review', 'unknown'),
      evaluation('c.manual', 'd.review', 'manual_review_required'),
      evaluation('c.agent-only', 'd.review', 'not_applicable'),
    ]);
    assert.equal(findings.length, 3);
    assert.deepEqual(
      findings.map((finding) => finding.findingType).sort(),
      ['control_failure', 'evidence_gap', 'manual_review'].sort(),
    );
    assert.ok(findings.every((finding) => finding.status === 'open'));
  });

  it('a contradictory-evidence failure is classified as an integrity issue', () => {
    const findings = derive([evaluation('c.threshold', 'd.core', 'fail', ['CONTROL_EVIDENCE_CONTRADICTORY'])]);
    assert.equal(findings[0]?.findingType, 'integrity_issue');
  });

  it('severity follows the framework severityMapping when defined (c.bool fail -> critical)', () => {
    const findings = derive([evaluation('c.bool', 'd.core', 'fail')]);
    assert.equal(findings[0]?.severity, 'critical');
  });

  it('default severity derives from criticality and blocking status -- never arbitrary', () => {
    const boolControl = framework.controls.find((control) => control.controlId === 'c.bool');
    const thresholdControl = framework.controls.find((control) => control.controlId === 'c.threshold');
    const agentControl = framework.controls.find((control) => control.controlId === 'c.agent-only');
    assert.ok(boolControl && thresholdControl && agentControl);
    // Without the explicit mapping, a blocking mandatory failure is critical.
    assert.equal(deriveFindingSeverity({ ...boolControl, severityMapping: {} }, 'fail', true), 'critical');
    assert.equal(deriveFindingSeverity({ ...boolControl, severityMapping: {} }, 'fail', false), 'high');
    assert.equal(deriveFindingSeverity(thresholdControl, 'fail', false), 'medium');
    assert.equal(deriveFindingSeverity(agentControl, 'fail', false), 'low');
    assert.equal(deriveFindingSeverity(thresholdControl, 'partial', false), 'low');
    assert.equal(deriveFindingSeverity({ ...boolControl, severityMapping: {} }, 'unknown', false), 'medium');
    assert.equal(deriveFindingSeverity(thresholdControl, 'manual_review_required', false), 'informational');
  });

  it('every finding carries structured remediation guidance (recommendation, never execution)', () => {
    const findings = derive([evaluation('c.bool', 'd.core', 'fail')]);
    const finding = findings[0];
    assert.ok(finding);
    assert.equal(finding.remediation.objective, 'Demonstrate the boolean condition holds.');
    assert.deepEqual(finding.remediation.recommendedActions, ['Make test.bool true.']);
    assert.equal(finding.remediation.priority, 'immediate');
    assert.ok(finding.remediation.requiredEvidence.length > 0);
  });
});

describe('Assurance findings -- append-only lifecycle (mission section 24/81)', () => {
  it('valid transitions: created -> accepted -> remediation_planned -> remediated -> closed -> reopened', () => {
    let status = applyFindingTransition(undefined, 'AssuranceFindingCreated');
    assert.equal(status, 'open');
    status = applyFindingTransition(status, 'AssuranceFindingAccepted');
    assert.equal(status, 'accepted');
    status = applyFindingTransition(status, 'AssuranceRemediationPlanned');
    assert.equal(status, 'remediation_planned');
    status = applyFindingTransition(status, 'AssuranceFindingRemediated');
    assert.equal(status, 'remediated');
    status = applyFindingTransition(status, 'AssuranceFindingClosed');
    assert.equal(status, 'closed');
    status = applyFindingTransition(status, 'AssuranceFindingReopened');
    assert.equal(status, 'open');
  });

  it('supersession is reachable from open states and reopenable', () => {
    let status = applyFindingTransition(undefined, 'AssuranceFindingCreated');
    status = applyFindingTransition(status, 'AssuranceFindingSuperseded');
    assert.equal(status, 'superseded');
    status = applyFindingTransition(status, 'AssuranceFindingReopened');
    assert.equal(status, 'open');
  });

  it('invalid transitions are rejected with ASSURANCE_INVALID_FINDING_TRANSITION', () => {
    const invalid: readonly { from: Parameters<typeof applyFindingTransition>[0]; event: AssuranceFindingEventType }[] = [
      { from: undefined, event: 'AssuranceFindingClosed' },
      { from: 'open', event: 'AssuranceFindingCreated' },
      { from: 'open', event: 'AssuranceFindingClosed' },
      { from: 'closed', event: 'AssuranceFindingAccepted' },
      { from: 'open', event: 'AssuranceFindingReopened' },
    ];
    for (const testCase of invalid) {
      assert.throws(
        () => applyFindingTransition(testCase.from, testCase.event),
        (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_INVALID_FINDING_TRANSITION',
        `${String(testCase.from)} + ${testCase.event}`,
      );
    }
  });

  it('foldFindingStatus folds an ordered event history into the current status', () => {
    const base = { findingId: 'finding-1', assessmentId: 'assessment-1', organizationId: 'org-1', actorId: 'user-1', payload: {}, occurredAt: 't' };
    const events: AssuranceFindingEvent[] = [
      buildFindingEvent({ ...base, findingEventId: 'event-1', eventType: 'AssuranceFindingCreated', sequence: 1 }),
      buildFindingEvent({ ...base, findingEventId: 'event-2', eventType: 'AssuranceFindingAccepted', sequence: 2 }),
      buildFindingEvent({ ...base, findingEventId: 'event-3', eventType: 'AssuranceFindingRemediated', sequence: 3 }),
    ];
    assert.equal(foldFindingStatus(events), 'remediated');
    assert.equal(foldFindingStatus([]), undefined);
  });

  it('finding events carry a deterministic digest over their content', () => {
    const input = {
      findingEventId: 'event-1',
      findingId: 'finding-1',
      assessmentId: 'assessment-1',
      organizationId: 'org-1',
      eventType: 'AssuranceFindingCreated' as const,
      sequence: 1,
      actorId: 'user-1',
      occurredAt: '2026-06-15T00:00:00.000Z',
    };
    const first = buildFindingEvent(input);
    const second = buildFindingEvent(input);
    assert.equal(first.eventDigest, second.eventDigest);
    const different = buildFindingEvent({ ...input, actorId: 'user-2' });
    assert.notEqual(first.eventDigest, different.eventDigest);
  });
});
