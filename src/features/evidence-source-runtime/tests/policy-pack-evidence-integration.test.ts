import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyPackEvidenceDemoFixture, PROCUREMENT_EVIDENCE_REQUIREMENT } from '../fixtures/policy-pack-evidence-demo.fixture.js';

describe('PolicyPackEvidenceIntegration', () => {
  it('1. maps PolicyEvidenceRequirement to EvidenceRequirement', () => {
    const { integration, requirementInput } = buildPolicyPackEvidenceDemoFixture();
    const requirements = integration.mapPolicyEvidenceRequirements(requirementInput);
    assert.equal(requirements.length, 1);
    assert.equal(requirements[0]?.source, 'policy_pack');
    assert.equal(requirements[0]?.type, 'purchase_order');
  });

  it('2. preserves sourceRuleId', () => {
    const { integration, requirementInput } = buildPolicyPackEvidenceDemoFixture();
    const [requirement] = integration.mapPolicyEvidenceRequirements(requirementInput);
    assert.equal(requirement?.sourceRuleId, PROCUREMENT_EVIDENCE_REQUIREMENT.sourceRuleId);
  });

  it('3. preserves policyPackVersionId', () => {
    const { integration, requirementInput } = buildPolicyPackEvidenceDemoFixture();
    const [requirement] = integration.mapPolicyEvidenceRequirements(requirementInput);
    assert.equal(requirement?.policyPackVersionId, requirementInput.policyPackVersionId);
  });

  it('4. validates satisfied evidence', () => {
    const { integration, requirementInput, purchaseOrderEvidence } = buildPolicyPackEvidenceDemoFixture();
    const result = integration.validatePolicyEvidenceSatisfaction(requirementInput, [purchaseOrderEvidence.id]);
    assert.equal(result.satisfied, true);
    assert.deepEqual(result.missingRequirementIds, []);
  });

  it('5. reports missing evidence', () => {
    const { integration, requirementInput } = buildPolicyPackEvidenceDemoFixture();
    const result = integration.validatePolicyEvidenceSatisfaction(requirementInput, []);
    assert.equal(result.satisfied, false);
    assert.equal(result.missingRequirementIds.length, 1);
  });

  it('6. reports rejected evidence', () => {
    const { runtime, integration, requirementInput, purchaseOrderEvidence } = buildPolicyPackEvidenceDemoFixture();
    runtime.evidenceArtifacts.reject(purchaseOrderEvidence.id, 'actor-reviewer', 'BAD', 'not acceptable');
    const result = integration.validatePolicyEvidenceSatisfaction(requirementInput, [purchaseOrderEvidence.id]);
    assert.equal(result.satisfied, false);
    assert.deepEqual(result.rejectedEvidenceArtifactIds, [purchaseOrderEvidence.id]);
  });

  it('7. reports expired evidence', () => {
    const { runtime, integration, requirementInput, purchaseOrderEvidence } = buildPolicyPackEvidenceDemoFixture();
    runtime.evidenceArtifacts.markExpired(purchaseOrderEvidence.id);
    const result = integration.validatePolicyEvidenceSatisfaction(requirementInput, [purchaseOrderEvidence.id]);
    assert.equal(result.satisfied, false);
    assert.deepEqual(result.expiredEvidenceArtifactIds, [purchaseOrderEvidence.id]);
  });

  it('8. does not re-evaluate policy rules (integration exposes no policy evaluation API)', () => {
    const { integration } = buildPolicyPackEvidenceDemoFixture();
    assert.equal('evaluatePolicy' in integration, false);
  });
});
