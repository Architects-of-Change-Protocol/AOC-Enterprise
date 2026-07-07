import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture, ENFORCEMENT_DECISION_ID } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: a sports settlement policy rule requires event_record evidence.
 * Event record evidence satisfies the requirement.
 */
describe('Scenario: event record evidence satisfies sports settlement', () => {
  it('has an accepted event_record artifact, a satisfied requirement, a proof, and a citation targeting the enforcement decision', () => {
    const { runtime, eventRecordEvidence, eventRecordRequirement, eventRecordSatisfaction, eventRecordToEnforcementCitation, enforcementDecisionProof } = buildEvidenceDemoFixture();

    assert.equal(eventRecordRequirement.type, 'event_record');
    assert.equal(runtime.evidenceArtifacts.get(eventRecordEvidence.id)?.status, 'accepted');
    assert.equal(eventRecordSatisfaction.status, 'satisfied');
    assert.equal(runtime.requirements.get(eventRecordRequirement.id)?.status, 'satisfied');

    assert.equal(enforcementDecisionProof.targetType, 'enforcement_decision');
    assert.equal(enforcementDecisionProof.targetId, ENFORCEMENT_DECISION_ID);
    assert.ok(enforcementDecisionProof.evidenceArtifactIds.includes(eventRecordEvidence.id));

    assert.equal(eventRecordToEnforcementCitation.targetType, 'enforcement_decision');
    assert.equal(eventRecordToEnforcementCitation.targetId, ENFORCEMENT_DECISION_ID);
  });
});
