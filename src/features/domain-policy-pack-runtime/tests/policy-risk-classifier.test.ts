import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import { PolicyRiskClassifier } from '../services/policy-risk-classifier.js';

function buildRuleResult(overrides: Partial<PolicyRuleEvaluationResult> = {}): PolicyRuleEvaluationResult {
  return {
    policyPackId: 'pack-1',
    policyPackVersionId: 'pack-1-v1',
    ruleId: 'rule-1',
    matched: true,
    effectType: 'raise_risk',
    severity: 'warning',
    reasonCode: 'RISK_UP',
    reason: 'risk raised',
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    ...overrides,
  };
}

describe('PolicyRiskClassifier', () => {
  it('1. preserves low risk when no override', () => {
    const classifier = new PolicyRiskClassifier();
    const result = classifier.classify('low', [buildRuleResult({ matched: false })]);
    assert.equal(result.effectiveRiskLevel, 'low');
    assert.equal(result.inputRiskLevel, 'low');
    assert.deepEqual(result.raisedByRuleIds, []);
  });

  it('2. raises low to medium', () => {
    const classifier = new PolicyRiskClassifier();
    const result = classifier.classify('low', [buildRuleResult()]);
    assert.equal(result.effectiveRiskLevel, 'medium');
    assert.deepEqual(result.raisedByRuleIds, ['rule-1']);
  });

  it('3. raises medium to high', () => {
    const classifier = new PolicyRiskClassifier();
    const result = classifier.classify('medium', [buildRuleResult()]);
    assert.equal(result.effectiveRiskLevel, 'high');
  });

  it('4. raises high to critical', () => {
    const classifier = new PolicyRiskClassifier();
    const result = classifier.classify('high', [buildRuleResult()]);
    assert.equal(result.effectiveRiskLevel, 'critical');
  });

  it('5. never lowers risk by default', () => {
    const classifier = new PolicyRiskClassifier();
    const result = classifier.classify('high', [buildRuleResult({ riskOverride: 'low' })]);
    assert.equal(result.effectiveRiskLevel, 'high');
    assert.deepEqual(result.raisedByRuleIds, []);
  });

  it('6. deterministic result', () => {
    const classifier = new PolicyRiskClassifier();
    const ruleResults = [buildRuleResult({ riskOverride: 'critical' })];
    const first = classifier.classify('low', ruleResults);
    const second = classifier.classify('low', ruleResults);
    assert.deepEqual(first, second);
  });
});
