import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyObligation } from '../domain/policy-pack-obligation.js';
import type { PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import { PolicyObligationService } from '../services/policy-obligation-service.js';

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

function buildObligation(overrides: Partial<PolicyObligation> = {}): PolicyObligation {
  return {
    id: 'obligation-1',
    type: 'record_event',
    description: 'Record the event.',
    required: true,
    ...overrides,
  };
}

describe('PolicyObligationService', () => {
  it('1. deduplicates obligations', () => {
    const service = new PolicyObligationService();
    const shared = buildObligation({ id: 'obligation-shared' });
    const results = [
      buildRuleResult({ ruleId: 'rule-1', obligations: [shared] }),
      buildRuleResult({ ruleId: 'rule-2', obligations: [shared] }),
    ];
    const grouping = service.collect(results);
    assert.equal(grouping.all.length, 1);
    assert.equal(grouping.all[0]!.id, 'obligation-shared');
  });

  it('2. separates required/optional obligations', () => {
    const service = new PolicyObligationService();
    const required = buildObligation({ id: 'obligation-required', required: true });
    const optional = buildObligation({ id: 'obligation-optional', type: 'notify_operator', required: false });
    const results = [buildRuleResult({ obligations: [required, optional] })];
    const grouping = service.collect(results);
    assert.deepEqual(grouping.required.map((obligation) => obligation.id), ['obligation-required']);
    assert.deepEqual(grouping.optional.map((obligation) => obligation.id), ['obligation-optional']);
    assert.equal(grouping.all.length, 2);
  });

  it('3. preserves deterministic order', () => {
    const service = new PolicyObligationService();
    const obligationB = buildObligation({ id: 'obligation-b' });
    const obligationA = buildObligation({ id: 'obligation-a' });
    const obligationC = buildObligation({ id: 'obligation-c' });
    const results = [
      buildRuleResult({ ruleId: 'rule-skipped', matched: false, obligations: [obligationC] }),
      buildRuleResult({ ruleId: 'rule-1', obligations: [obligationB, obligationA] }),
      buildRuleResult({ ruleId: 'rule-2', obligations: [obligationA, obligationC] }),
    ];
    const grouping = service.collect(results);
    assert.deepEqual(
      grouping.all.map((obligation) => obligation.id),
      ['obligation-b', 'obligation-a', 'obligation-c'],
    );
  });
});
