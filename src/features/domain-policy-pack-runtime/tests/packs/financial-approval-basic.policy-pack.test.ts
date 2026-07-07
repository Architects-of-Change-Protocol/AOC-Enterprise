import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime, buildPolicyEvaluationInput } from '../../fixtures/domain-policy-pack-demo.fixture.js';

describe('financial-approval-basic policy pack', () => {
  it('1. finance_approval capability requires finance review', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'financial-approval-basic-test-1',
        action: 'perform_financial_action',
        domain: 'financial_approval',
        capability: 'finance_approval',
        hasApprovalProof: false,
        riskLevel: 'low',
      }),
    );

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.matchedRuleIds.includes('financial-approval-basic-rule-finance-approval-capability'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'finance_review'));
  });

  it('2. bank_details_management capability is denied by default', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'financial-approval-basic-test-2',
        action: 'manage_bank_details',
        domain: 'financial_approval',
        capability: 'bank_details_management',
      }),
    );

    assert.equal(result.decision.type, 'denied');
    assert.equal(result.decision.allowed, false);
    assert.ok(result.decision.matchedRuleIds.includes('financial-approval-basic-rule-bank-details-denied'));
  });

  it('3. financial side effects require single approval proof', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'financial-approval-basic-test-3',
        action: 'perform_financial_action',
        domain: 'financial_approval',
        sideEffectType: 'financial',
        riskLevel: 'medium',
        hasApprovalProof: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.matchedRuleIds.includes('financial-approval-basic-rule-financial-side-effect-approval'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'single_approval'));
  });

  it('4. critical financial risk requires dual approval', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'financial-approval-basic-test-4',
        action: 'perform_financial_action',
        domain: 'financial_approval',
        sideEffectType: 'financial',
        riskLevel: 'critical',
        hasApprovalProof: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.matchedRuleIds.includes('financial-approval-basic-rule-critical-risk-dual-approval'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'dual_approval'));
  });
});
