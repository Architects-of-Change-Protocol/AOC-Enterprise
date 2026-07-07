import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyApprovalRequirement } from '../domain/policy-pack-approval.js';
import {
  createApprovalPolicyPackIntegration,
  type PolicyApprovalMappingInput,
} from '../integrations/approval-policy-pack-integration.js';

const CONTEXT = {
  trustDomainId: 'trust-domain-approval-mapping',
  action: 'approve_payment',
  resourceScope: 'project:approval-mapping',
  riskLevel: 'high' as const,
};

function buildRequirement(overrides: Partial<PolicyApprovalRequirement> & Pick<PolicyApprovalRequirement, 'type'>): PolicyApprovalRequirement {
  return {
    id: `approval-requirement-${overrides.type}`,
    description: `A ${overrides.type} is required.`,
    required: true,
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    ...overrides,
  };
}

function buildMappingInput(approvalRequirements: readonly PolicyApprovalRequirement[]): PolicyApprovalMappingInput {
  return { ...CONTEXT, approvalRequirements };
}

describe('ApprovalPolicyPackIntegration', () => {
  it('1. finance_review maps to approval requirement', () => {
    const integration = createApprovalPolicyPackIntegration();
    const result = integration.mapPolicyApprovalRequirements(buildMappingInput([buildRequirement({ type: 'finance_review' })]));
    assert.equal(result[0]!.type, 'authority_based_approval');
    assert.equal(result[0]!.requiredAuthorityCapability, 'approve_financial_action');
  });

  it('2. legal_review maps to approval requirement', () => {
    const integration = createApprovalPolicyPackIntegration();
    const result = integration.mapPolicyApprovalRequirements(buildMappingInput([buildRequirement({ type: 'legal_review' })]));
    assert.equal(result[0]!.type, 'authority_based_approval');
    assert.equal(result[0]!.requiredAuthorityCapability, 'approve_critical_action');
  });

  it('3. compliance_review maps to approval requirement', () => {
    const integration = createApprovalPolicyPackIntegration();
    const result = integration.mapPolicyApprovalRequirements(buildMappingInput([buildRequirement({ type: 'compliance_review' })]));
    assert.equal(result[0]!.type, 'authority_based_approval');
    assert.equal(result[0]!.requiredAuthorityCapability, 'approve_critical_action');
  });

  it('4. operator_review maps to approval requirement', () => {
    const integration = createApprovalPolicyPackIntegration();
    const result = integration.mapPolicyApprovalRequirements(buildMappingInput([buildRequirement({ type: 'operator_review' })]));
    assert.equal(result[0]!.type, 'authority_based_approval');
    assert.equal(result[0]!.requiredAuthorityCapability, 'approve_project_action');
  });

  it('5. mapping preserves segregation of duties and copies mapping context', () => {
    const integration = createApprovalPolicyPackIntegration();
    const result = integration.mapPolicyApprovalRequirements(
      buildMappingInput([buildRequirement({ type: 'dual_approval', requiresSegregationOfDuties: true, minimumApprovals: 2 })]),
    );
    assert.equal(result[0]!.requiresSegregationOfDuties, true);
    assert.equal(result[0]!.trustDomainId, CONTEXT.trustDomainId);
    assert.equal(result[0]!.action, CONTEXT.action);
    assert.equal(result[0]!.resourceScope, CONTEXT.resourceScope);
    assert.equal(result[0]!.riskLevel, CONTEXT.riskLevel);
    assert.deepEqual(result[0]!.evidenceRequirements, []);
  });
});
