import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime, buildPolicyEvaluationInput } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { JURISDICTIONAL_BASELINE_DEMO_POLICY_PACK_VERSION_V1 } from '../../packs/jurisdictional-baseline-demo.policy-pack.js';

describe('jurisdictional-baseline-demo policy pack', () => {
  it('1. legal side effect requires legal review', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'jurisdictional-baseline-demo-test-1',
        action: 'draft_agreement',
        domain: 'general_enterprise',
        sideEffectType: 'legal',
        hasApprovalProof: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.matchedRuleIds.includes('jurisdictional-baseline-demo-rule-legal-contractual-review'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'legal_review'));
  });

  it('2. sign_contract requires authority proof and approval proof', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'jurisdictional-baseline-demo-test-2',
        action: 'sign_contract',
        domain: 'general_enterprise',
        hasAuthorityProof: false,
        hasApprovalProof: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_authority');
    assert.ok(result.decision.matchedRuleIds.includes('jurisdictional-baseline-demo-rule-sign-contract-authority'));
    assert.ok(result.decision.matchedRuleIds.includes('jurisdictional-baseline-demo-rule-sign-contract-approval'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'legal_review'));
  });

  it('3. unknown jurisdiction requires manual verification', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'jurisdictional-baseline-demo-test-3',
        action: 'review_policy',
        domain: 'general_enterprise',
        jurisdiction: 'some-totally-unrecognized-place',
      }),
    );

    assert.equal(result.decision.type, 'warning');
    assert.ok(result.decision.matchedRuleIds.includes('jurisdictional-baseline-demo-rule-jurisdiction-source-reference'));
    assert.ok(result.decision.matchedRuleIds.includes('jurisdictional-baseline-demo-rule-unknown-jurisdiction'));
    assert.ok(result.decision.obligations.some((obligation) => obligation.type === 'manual_verification'));
    assert.ok(result.decision.obligations.some((obligation) => obligation.type === 'attach_source_reference'));
  });

  it('4. pack is marked demoOnly and not_legal_advice', () => {
    assert.equal(JURISDICTIONAL_BASELINE_DEMO_POLICY_PACK_VERSION_V1.demoOnly, true);
    assert.equal(JURISDICTIONAL_BASELINE_DEMO_POLICY_PACK_VERSION_V1.legalCompleteness, 'not_legal_advice');
  });
});
