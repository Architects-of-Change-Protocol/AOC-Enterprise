import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime, buildPolicyEvaluationInput } from '../../fixtures/domain-policy-pack-demo.fixture.js';

describe('data-boundary-basic policy pack', () => {
  it('1. non-sensitive read_project_summary is allowed', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'data-boundary-basic-test-1',
        action: 'read_project_summary',
        domain: 'data_boundary',
        dataDomains: ['project_metadata'],
      }),
    );

    assert.equal(result.decision.type, 'allowed');
    assert.ok(result.decision.matchedRuleIds.includes('data-boundary-basic-rule-non-sensitive-read-allowed'));
  });

  it('2. sensitive data export requires compliance review', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'data-boundary-basic-test-2',
        action: 'export_client_data',
        domain: 'data_boundary',
        dataDomains: ['pii'],
        hasApprovalProof: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_approval');
    assert.ok(result.decision.matchedRuleIds.includes('data-boundary-basic-rule-sensitive-export-compliance-review'));
    assert.ok(result.decision.approvalRequirements.some((requirement) => requirement.type === 'compliance_review'));
  });

  it('3. prohibited data domain export is denied', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'data-boundary-basic-test-3',
        action: 'export_client_data',
        domain: 'data_boundary',
        dataDomains: ['classified'],
      }),
    );

    assert.equal(result.decision.type, 'denied');
    assert.equal(result.decision.allowed, false);
    assert.ok(result.decision.matchedRuleIds.includes('data-boundary-basic-rule-prohibited-export-denied'));
  });

  it('4. missing data classification evidence requires evidence', () => {
    const runtime = buildDemoPolicyPackRuntime();
    const result = runtime.evaluatePolicy(
      buildPolicyEvaluationInput({
        id: 'data-boundary-basic-test-4',
        action: 'process_data_export',
        domain: 'data_boundary',
        sideEffectType: 'data_export',
        hasRequiredEvidence: false,
      }),
    );

    assert.equal(result.decision.type, 'requires_evidence');
    assert.ok(result.decision.matchedRuleIds.includes('data-boundary-basic-rule-data-export-classification-evidence'));
    assert.ok(result.decision.evidenceRequirements.some((requirement) => requirement.type === 'data_classification'));
  });
});
