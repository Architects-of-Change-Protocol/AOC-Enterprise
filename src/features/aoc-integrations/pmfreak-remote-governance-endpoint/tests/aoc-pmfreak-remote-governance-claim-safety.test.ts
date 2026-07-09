import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoAocPMFreakRemoteGovernanceEndpointOverclaim, evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety } from '../aoc-pmfreak-remote-governance-claim-safety.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_DISCLAIMERS, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';
import { demoAocPMFreakRemoteBillingAllowedEndpointResponse } from '../aoc-pmfreak-remote-governance-fixtures.js';

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
  'AOC PMFreak remote governance endpoint',
  'PMFreak consumes AOC Governance',
  'Governance decision returned',
  'No PMFreak mutation performed',
  'No action execution performed',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Not compliance certification',
  'Not legal advice',
];

describe('AOC PMFreak Remote Governance Endpoint -- claim safety', () => {
  it('catches every required unsafe phrase', () => {
    for (const phrase of UNSAFE_PHRASES) {
      const result = evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety(`This output claims: ${phrase}.`);
      assert.equal(result.safe, false, `expected "${phrase}" to be flagged unsafe`);
      assert.ok(result.unsafePhrases.length > 0);
      assert.throws(() => assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(`This output claims: ${phrase}.`));
    }
  });

  it('does not false-positive on any required safe phrase', () => {
    for (const phrase of SAFE_PHRASES) {
      const result = evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety(phrase);
      assert.equal(result.safe, true, `expected "${phrase}" to be safe`);
      assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(phrase);
    }
  });

  it('the endpoint constants safe labels and disclaimers are all themselves claim-safe', () => {
    assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS);
    assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_DISCLAIMERS);
  });

  it('every response fixture passes claim safety', () => {
    assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(demoAocPMFreakRemoteBillingAllowedEndpointResponse);
  });

  it('carries the checked text back on the result', () => {
    const result = evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety('hello world');
    assert.equal(result.checkedText, 'hello world');
  });
});
