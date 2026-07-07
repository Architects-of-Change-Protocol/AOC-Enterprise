import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyEvidenceRequirement, PolicyEvidenceRequirementType } from '../domain/policy-pack-evidence.js';
import type { PolicyEvaluationInput, PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import { PolicyEvidenceService } from '../services/policy-evidence-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildRuleResult(overrides: Partial<PolicyRuleEvaluationResult> = {}): PolicyRuleEvaluationResult {
  return {
    policyPackId: 'pack-1',
    policyPackVersionId: 'pack-1-v1',
    ruleId: 'rule-1',
    matched: true,
    severity: 'info',
    reasonCode: 'TEST',
    reason: 'test reason',
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    ...overrides,
  };
}

function buildEvidenceRequirement(overrides: Partial<PolicyEvidenceRequirement> = {}): PolicyEvidenceRequirement {
  return {
    id: 'evidence-1',
    type: 'invoice',
    description: 'Attach invoice.',
    required: true,
    ...overrides,
  };
}

function buildInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return {
    id: 'input-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'scope-1',
    riskLevel: 'low',
    requestedAt: NOW,
    ...overrides,
  };
}

describe('PolicyEvidenceService', () => {
  it('1. collects evidence requirements from matched rule results', () => {
    const service = new PolicyEvidenceService();
    const requirement = buildEvidenceRequirement();
    const result = service.collect([buildRuleResult({ evidenceRequirements: [requirement] })], buildInput());
    assert.equal(result.requirements.length, 1);
    assert.equal(result.requirements[0]!.id, 'evidence-1');
  });

  it('2. deduplicates requirements', () => {
    const service = new PolicyEvidenceService();
    const original = buildEvidenceRequirement({ id: 'evidence-1', type: 'invoice', description: 'Original.' });
    const duplicate = buildEvidenceRequirement({ id: 'evidence-1', type: 'invoice', description: 'Duplicate.' });
    const differentType = buildEvidenceRequirement({ id: 'evidence-1', type: 'contract', description: 'Different type.' });
    const results = [
      buildRuleResult({ ruleId: 'rule-1', evidenceRequirements: [original] }),
      buildRuleResult({ ruleId: 'rule-2', evidenceRequirements: [duplicate, differentType] }),
    ];
    const result = service.collect(results, buildInput());
    assert.equal(result.requirements.length, 2);
    assert.equal(result.requirements[0]!.description, 'Original.');
  });

  it('3. identifies missing evidence', () => {
    const service = new PolicyEvidenceService();
    const requirement = buildEvidenceRequirement({ id: 'evidence-required', required: true });
    const result = service.collect(
      [buildRuleResult({ evidenceRequirements: [requirement] })],
      buildInput({ evidenceIds: ['some-other-evidence'] }),
    );
    assert.deepEqual(result.missingRequirementIds, ['evidence-required']);
    assert.equal(result.satisfied, false);
  });

  it('4. maps evidence requirements structurally', () => {
    const service = new PolicyEvidenceService();
    const cases: ReadonlyArray<[PolicyEvidenceRequirementType, string]> = [
      ['contract', 'source_document'],
      ['purchase_order', 'source_document'],
      ['invoice', 'source_document'],
      ['event_record', 'source_document'],
      ['approval_memo', 'human_comment'],
      ['authority_proof', 'authority_proof'],
      ['identity_proof', 'source_document'],
      ['customer_policy', 'source_document'],
      ['data_classification', 'source_document'],
      ['risk_assessment', 'policy_result'],
      ['human_comment', 'human_comment'],
      ['system_log', 'system_log'],
      ['external_reference', 'external_reference'],
    ];

    for (const [type, expectedType] of cases) {
      const requirement = buildEvidenceRequirement({ id: `evidence-${type}`, type, required: true });
      const structural = service.toStructuralApprovalEvidence(requirement);
      assert.equal(structural.type, expectedType, `expected ${type} to map to ${expectedType}`);
      assert.equal(structural.id, requirement.id);
      assert.equal(structural.required, requirement.required);
      assert.equal(structural.description, requirement.description);
    }
  });
});
