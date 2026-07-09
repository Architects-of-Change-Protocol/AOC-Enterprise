import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakDecisionSafeSummary, mapAocPMFreakDecisionToLabel, mapAocPMFreakDecisionToSeverity } from '../aoc-pmfreak-governance-decision-mapping.js';
import { demoAocPMFreakBillingAllowedRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';
import type { AocPMFreakGovernanceDecision } from '../aoc-pmfreak-governance-intake-types.js';

const ALL_DECISIONS: readonly AocPMFreakGovernanceDecision[] = [
  'allow',
  'deny',
  'hold',
  'require_evidence',
  'require_pm_approval',
  'require_customer_validation',
  'require_billing_review',
  'require_contract_review',
  'require_security_review',
  'require_executive_approval',
];

describe('AOC PMFreak Governance Request Intake -- decision mapping', () => {
  it('maps every decision to a non-empty label', () => {
    for (const decision of ALL_DECISIONS) {
      assert.ok(mapAocPMFreakDecisionToLabel(decision).length > 0, `expected a label for "${decision}"`);
    }
  });

  it('maps severities per the recommended scheme', () => {
    assert.equal(mapAocPMFreakDecisionToSeverity('allow'), 'success');
    assert.equal(mapAocPMFreakDecisionToSeverity('deny'), 'danger');
    assert.equal(mapAocPMFreakDecisionToSeverity('hold'), 'warning');
    for (const decision of ALL_DECISIONS.filter((d) => d.startsWith('require_'))) {
      assert.equal(mapAocPMFreakDecisionToSeverity(decision), 'warning', `expected "${decision}" to map to warning severity`);
    }
  });

  it('never claims invoice validity, customer acceptance, compliance, or legal status in any decision summary', () => {
    const forbidden = ['invoice validity certified', 'customer acceptance certified', 'compliance passed', 'legally approved', 'contractually compliant'];

    for (const decision of ALL_DECISIONS) {
      const summary = createAocPMFreakDecisionSafeSummary(decision, demoAocPMFreakBillingAllowedRequest).toLowerCase();
      for (const phrase of forbidden) {
        assert.ok(!summary.includes(phrase), `expected summary for "${decision}" to not contain "${phrase}"`);
      }
    }
  });

  it('every summary carries the safe-framing disclaimer clause', () => {
    for (const decision of ALL_DECISIONS) {
      const summary = createAocPMFreakDecisionSafeSummary(decision, demoAocPMFreakBillingAllowedRequest);
      assert.ok(summary.includes('not an invoice validity certification'));
      assert.ok(summary.includes('not a customer acceptance certification'));
      assert.ok(summary.includes('not a compliance or legal determination'));
    }
  });
});
