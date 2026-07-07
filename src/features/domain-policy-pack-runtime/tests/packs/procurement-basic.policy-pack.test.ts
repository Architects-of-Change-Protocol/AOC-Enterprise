import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime, buildPolicyEvaluationInput } from '../../fixtures/domain-policy-pack-demo.fixture.js';

describe('procurement-basic policy pack', () => {
  it('1. prepare_invoice_support requires purchase order or invoice evidence', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'procurement-basic-test-1',
        action: 'prepare_invoice_support',
        domain: 'procurement',
        counterpartyId: 'counterparty-1',
        riskLevel: 'low',
        hasRequiredEvidence: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_evidence');
    assert.ok(result.decision.matchedRuleIds.includes('procurement-basic-rule-invoice-support-evidence'));
    assert.ok(result.decision.evidenceRequirements.some((requirement) => requirement.type === 'purchase_order'));
  });

  it('2. missing counterpartyId denies vendor action', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'procurement-basic-test-2',
        action: 'prepare_invoice_support',
        domain: 'procurement',
        riskLevel: 'low',
        hasRequiredEvidence: true,
      }),
    );

    assert.equal(result.decision.type, 'denied');
    assert.equal(result.decision.allowed, false);
    assert.ok(result.decision.matchedRuleIds.includes('procurement-basic-rule-vendor-counterparty-required'));
  });

  it('3. high-risk procurement requires operator review', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'procurement-basic-test-3',
        action: 'review_vendor_contract',
        domain: 'procurement',
        counterpartyId: 'counterparty-1',
        riskLevel: 'critical',
        hasApprovalProof: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.matchedRuleIds.includes('procurement-basic-rule-high-risk-operator-review'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'operator_review'));
  });
});
