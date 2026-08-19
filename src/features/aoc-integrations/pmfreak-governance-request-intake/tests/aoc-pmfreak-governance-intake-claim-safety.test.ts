import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoAocPMFreakGovernanceIntakeOverclaim, evaluateAocPMFreakGovernanceIntakeClaimSafety } from '../aoc-pmfreak-governance-intake-claim-safety.js';
import { AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS, AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS } from '../aoc-pmfreak-governance-intake-constants.js';
import { demoAocPMFreakBillingAllowedResponse } from '../aoc-pmfreak-governance-intake-fixtures.js';

const UNSAFE_PHRASES = [
  'fully trusted agent',
  'certified enterprise compliant',
  'risk-free execution',
  'production authorized',
  'invoice-ready certified',
  'invoice ready certified',
  'customer acceptance certified',
  'contractually compliant',
  'legally approved',
  'compliance passed',
  'guaranteed billing',
  'certified audit export',
  'legal evidence package',
  'Costa Rica compliant',
  'CR compliant',
  'invoice validity certified',
  'billing entitlement guaranteed',
  'customer acceptance legally sufficient',
  'project compliant',
  'production execution approved',
  'action legally authorized',
  'contract violation detected',
  'invoice legally blocked',
  'customer acceptance invalid',
];

const SAFE_PHRASES = [
  'Soberanía Governance intake',
  'PMFreak consumes Soberanía Governance',
  'Governance decision returned',
  'No PMFreak mutation performed',
  'No action execution performed',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Not compliance certification',
  'Not legal advice',
  'Evidence required',
  'Approval required',
];

describe('Soberanía PMFreak Governance Request Intake -- claim safety', () => {
  it('catches every required unsafe phrase', () => {
    for (const phrase of UNSAFE_PHRASES) {
      const result = evaluateAocPMFreakGovernanceIntakeClaimSafety(`This output claims: ${phrase}.`);
      assert.equal(result.safe, false, `expected "${phrase}" to be flagged unsafe`);
      assert.ok(result.unsafePhrases.length > 0);
      assert.throws(() => assertNoAocPMFreakGovernanceIntakeOverclaim(`This output claims: ${phrase}.`));
    }
  });

  it('does not false-positive on any required safe phrase', () => {
    for (const phrase of SAFE_PHRASES) {
      const result = evaluateAocPMFreakGovernanceIntakeClaimSafety(phrase);
      assert.equal(result.safe, true, `expected "${phrase}" to be safe`);
      assertNoAocPMFreakGovernanceIntakeOverclaim(phrase);
    }
  });

  it('the intake constants safe labels and disclaimers are all themselves claim-safe', () => {
    assertNoAocPMFreakGovernanceIntakeOverclaim(AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS);
    assertNoAocPMFreakGovernanceIntakeOverclaim(AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS);
  });

  it('every response fixture passes claim safety', () => {
    assertNoAocPMFreakGovernanceIntakeOverclaim(demoAocPMFreakBillingAllowedResponse);
  });

  it('carries the checked text back on the result', () => {
    const result = evaluateAocPMFreakGovernanceIntakeClaimSafety('hello world');
    assert.equal(result.checkedText, 'hello world');
  });
});
