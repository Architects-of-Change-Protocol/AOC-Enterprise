import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnforcementEvidenceDemoFixture, TRUST_DOMAIN_ID, ENFORCEMENT_DECISION_ID } from '../fixtures/enforcement-evidence-demo.fixture.js';

describe('ActionEnforcementEvidenceIntegration', () => {
  it('1. maps evidence_required enforcement decision to EvidenceRequirement', () => {
    const { requirement } = buildEnforcementEvidenceDemoFixture();
    assert.equal(requirement.source, 'action_enforcement');
    assert.equal(requirement.enforcementDecisionId, ENFORCEMENT_DECISION_ID);
  });

  it('2. validates evidenceIds from request', () => {
    const { runtime, integration, requirement } = buildEnforcementEvidenceDemoFixture();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-1', type: 'invoice', title: 'Invoice', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: 'actor-1' });
    runtime.evidenceArtifacts.accept(artifact.id, 'actor-reviewer');
    const result = integration.checkEvidenceForEnforcementRequest({
      enforcementDecisionId: ENFORCEMENT_DECISION_ID,
      requirementIds: [requirement.id],
      evidenceArtifactIds: [artifact.id],
    });
    assert.equal(result.type, 'evidence_satisfied');
  });

  it('3. reports evidence_satisfied', () => {
    const { runtime, integration, requirement } = buildEnforcementEvidenceDemoFixture();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-2', type: 'invoice', title: 'Invoice', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: 'actor-1' });
    runtime.evidenceArtifacts.accept(artifact.id, 'actor-reviewer');
    const result = integration.checkEvidenceForEnforcementRequest({ enforcementDecisionId: ENFORCEMENT_DECISION_ID, requirementIds: [requirement.id], evidenceArtifactIds: [artifact.id] });
    assert.equal(result.satisfied, true);
  });

  it('4. reports evidence_missing', () => {
    const { integration, requirement } = buildEnforcementEvidenceDemoFixture();
    const result = integration.checkEvidenceForEnforcementRequest({ enforcementDecisionId: ENFORCEMENT_DECISION_ID, requirementIds: [requirement.id], evidenceArtifactIds: [] });
    assert.equal(result.type, 'evidence_missing');
    assert.deepEqual(result.missingRequirementIds, [requirement.id]);
  });

  it('5. reports evidence_rejected', () => {
    const { runtime, integration, requirement } = buildEnforcementEvidenceDemoFixture();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-3', type: 'invoice', title: 'Invoice', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: 'actor-1' });
    runtime.evidenceArtifacts.reject(artifact.id, 'actor-reviewer', 'BAD', 'not acceptable');
    const result = integration.checkEvidenceForEnforcementRequest({ enforcementDecisionId: ENFORCEMENT_DECISION_ID, requirementIds: [requirement.id], evidenceArtifactIds: [artifact.id] });
    assert.equal(result.type, 'evidence_rejected');
  });

  it('6. reports evidence_expired', () => {
    const { runtime, integration, requirement } = buildEnforcementEvidenceDemoFixture();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-4', type: 'invoice', title: 'Invoice', trustDomainId: TRUST_DOMAIN_ID, submittedByActorId: 'actor-1' });
    runtime.evidenceArtifacts.accept(artifact.id, 'actor-reviewer');
    runtime.evidenceArtifacts.markExpired(artifact.id);
    const result = integration.checkEvidenceForEnforcementRequest({ enforcementDecisionId: ENFORCEMENT_DECISION_ID, requirementIds: [requirement.id], evidenceArtifactIds: [artifact.id] });
    assert.equal(result.type, 'evidence_expired');
  });

  it('7. does not override core enforcement denial (integration exposes no enforcement decision API)', () => {
    const { integration } = buildEnforcementEvidenceDemoFixture();
    assert.equal('overrideEnforcementDecision' in integration, false);
    assert.equal('allowExecution' in integration, false);
  });
});
