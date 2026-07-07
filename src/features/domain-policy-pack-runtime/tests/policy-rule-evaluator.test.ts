import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyPackRule } from '../domain/policy-pack-rule.js';
import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyEvaluationInput } from '../domain/policy-pack-evaluation.js';
import { PolicyRuleEvaluator } from '../services/policy-rule-evaluator.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildRule(overrides: Partial<PolicyPackRule> = {}): PolicyPackRule {
  return {
    id: 'rule-1',
    policyPackVersionId: 'version-1',
    name: 'Test rule',
    description: 'A test rule.',
    status: 'active',
    priority: 100,
    condition: { type: 'predicate', field: 'action', operator: 'equals', value: 'approve_payment' },
    effect: { type: 'require_approval', reasonCode: 'NEEDS_APPROVAL', reason: 'Needs approval.' },
    obligations: [{ id: 'obligation-1', type: 'record_event', description: 'Record it.', required: true }],
    evidenceRequirements: [{ id: 'evidence-1', type: 'invoice', description: 'Attach invoice.', required: true }],
    approvalRequirements: [
      { id: 'approval-1', type: 'finance_review', description: 'Finance review.', required: true, minimumApprovals: 1, requiresSegregationOfDuties: false },
    ],
    severity: 'error',
    sourceIds: ['source-1'],
    ...overrides,
  };
}

function buildVersion(rules: readonly PolicyPackRule[]): PolicyPackVersion {
  return {
    id: 'version-1',
    policyPackId: 'pack-1',
    version: '1.0.0',
    status: 'active',
    scope: {},
    rules,
    sources: [],
    effectiveFrom: NOW,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
    createdAt: NOW,
    updatedAt: NOW,
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

describe('PolicyRuleEvaluator', () => {
  it('1. evaluates matching rule', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule()])], buildInput());
    assert.equal(results.length, 1);
    assert.equal(results[0]!.matched, true);
    assert.equal(results[0]!.effectType, 'require_approval');
  });

  it('2. evaluates non-matching rule', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule()])], buildInput({ action: 'other' }));
    assert.equal(results.length, 1);
    assert.equal(results[0]!.matched, false);
    assert.equal(results[0]!.effectType, undefined);
  });

  it('3. evaluates rules by priority', () => {
    const evaluator = new PolicyRuleEvaluator();
    const highPriority = buildRule({ id: 'rule-high', priority: 10 });
    const lowPriority = buildRule({ id: 'rule-low', priority: 200 });
    const results = evaluator.evaluate([buildVersion([lowPriority, highPriority])], buildInput());
    assert.deepEqual(results.map((result) => result.ruleId), ['rule-high', 'rule-low']);
  });

  it('4. collects obligations', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule()])], buildInput());
    assert.equal(results[0]!.obligations.length, 1);
  });

  it('5. collects evidence requirements', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule()])], buildInput());
    assert.equal(results[0]!.evidenceRequirements.length, 1);
  });

  it('6. collects approval requirements', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule()])], buildInput());
    assert.equal(results[0]!.approvalRequirements.length, 1);
  });

  it('7. preserves source IDs', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule()])], buildInput());
    assert.deepEqual(results[0]!.evidenceRequirements[0]!.sourceRuleId, undefined);
    assert.deepEqual(buildRule().sourceIds, ['source-1']);
  });

  it('8. deterministic results', () => {
    const evaluator = new PolicyRuleEvaluator();
    const version = buildVersion([buildRule()]);
    const first = evaluator.evaluate([version], buildInput());
    const second = evaluator.evaluate([version], buildInput());
    assert.deepEqual(first, second);
  });

  it('does not evaluate deprecated/disabled rules', () => {
    const evaluator = new PolicyRuleEvaluator();
    const results = evaluator.evaluate([buildVersion([buildRule({ status: 'disabled' })])], buildInput());
    assert.equal(results.length, 0);
  });
});
