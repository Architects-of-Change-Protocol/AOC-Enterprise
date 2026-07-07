import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyApprovalRequirement } from '../domain/policy-pack-approval.js';
import type { PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import { PolicyApprovalRequirementService } from '../services/policy-approval-requirement-service.js';

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

function buildApproval(overrides: Partial<PolicyApprovalRequirement> = {}): PolicyApprovalRequirement {
  return {
    id: 'approval-1',
    type: 'single_approval',
    description: 'Approval required.',
    required: true,
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    ...overrides,
  };
}

describe('PolicyApprovalRequirementService', () => {
  it('1. collects approval requirements from matched rule results', () => {
    const service = new PolicyApprovalRequirementService();
    const requirement = buildApproval();
    const collected = service.collect([buildRuleResult({ approvalRequirements: [requirement] })]);
    assert.equal(collected.length, 1);
    assert.equal(collected[0]!.id, 'approval-1');
  });

  it('2. deduplicates approval requirements', () => {
    const service = new PolicyApprovalRequirementService();
    const shared = buildApproval({ id: 'approval-shared' });
    const results = [
      buildRuleResult({ ruleId: 'rule-1', approvalRequirements: [shared] }),
      buildRuleResult({ ruleId: 'rule-2', approvalRequirements: [shared] }),
    ];
    const collected = service.collect(results);
    assert.equal(collected.length, 1);
    assert.equal(collected[0]!.id, 'approval-shared');
  });

  it('3. maps finance_review', () => {
    const service = new PolicyApprovalRequirementService();
    const requirement = buildApproval({ id: 'approval-finance', type: 'finance_review' });
    const structural = service.toStructuralApprovalRequirement(requirement);
    assert.equal(structural.type, 'authority_based_approval');
    assert.equal(structural.requiredAuthorityCapability, 'approve_financial_action');
  });

  it('4. maps legal_review', () => {
    const service = new PolicyApprovalRequirementService();
    const requirement = buildApproval({ id: 'approval-legal', type: 'legal_review' });
    const structural = service.toStructuralApprovalRequirement(requirement);
    assert.equal(structural.type, 'authority_based_approval');
    assert.equal(structural.requiredAuthorityCapability, 'approve_critical_action');
  });

  it('5. maps compliance_review', () => {
    const service = new PolicyApprovalRequirementService();
    const requirement = buildApproval({ id: 'approval-compliance', type: 'compliance_review' });
    const structural = service.toStructuralApprovalRequirement(requirement);
    assert.equal(structural.type, 'authority_based_approval');
    assert.equal(structural.requiredAuthorityCapability, 'approve_critical_action');
  });

  it('6. maps operator_review', () => {
    const service = new PolicyApprovalRequirementService();
    const requirement = buildApproval({ id: 'approval-operator', type: 'operator_review' });
    const structural = service.toStructuralApprovalRequirement(requirement);
    assert.equal(structural.type, 'authority_based_approval');
    assert.equal(structural.requiredAuthorityCapability, 'approve_project_action');
  });

  it('7. preserves segregation of duties', () => {
    const service = new PolicyApprovalRequirementService();
    const withSegregation = buildApproval({ id: 'approval-seg-true', requiresSegregationOfDuties: true });
    const withoutSegregation = buildApproval({ id: 'approval-seg-false', requiresSegregationOfDuties: false });
    assert.equal(service.toStructuralApprovalRequirement(withSegregation).requiresSegregationOfDuties, true);
    assert.equal(service.toStructuralApprovalRequirement(withoutSegregation).requiresSegregationOfDuties, false);
  });
});
