import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildHighValueFinancialSideEffectInput } from '../../fixtures/payments-policy-demo.fixture.js';
import { PolicyApprovalRequirementService } from '../../services/policy-approval-requirement-service.js';

describe('policy pack requires human approval for high-value financial side effects', () => {
  it('1. a high-value financial side effect requires dual approval', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildHighValueFinancialSideEffectInput());

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.approvalRequirements.length > 0);

    const approvalService = new PolicyApprovalRequirementService();
    const requirement = result.decision.approvalRequirements[0]!;
    const structural = approvalService.toStructuralApprovalRequirement(requirement);

    assert.equal(structural.minimumApprovals, requirement.minimumApprovals);

    assert.ok(result.proof);
    assert.equal(result.decision.proofId, result.proof!.id);
  });
});
