import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { evaluatePolicyPackClaimSafety } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';
import type { PolicyPackClaimSafetyOptions, PolicyPackClaimSafetyResult } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';

/**
 * Migration note (Jurisdiction Pack Runtime <-> Policy Pack Foundation alignment):
 * this module previously would have needed its own
 * `JURISDICTION_PROHIBITED_OVERCLAIM_PHRASES` scanner. It does not have one.
 * `assertNoJurisdictionOverclaim` and `evaluateJurisdictionClaimSafety` are
 * thin wrappers that delegate every scan to the universal
 * `policy-pack-foundation` claim-safety harness, so jurisdiction output can
 * never drift from the shared prohibited-phrase list.
 */
export function assertNoJurisdictionOverclaim(value: unknown): void {
  assertNoPolicyPackOverclaim(value);
}

export function evaluateJurisdictionClaimSafety(value: unknown, options?: PolicyPackClaimSafetyOptions): PolicyPackClaimSafetyResult {
  return evaluatePolicyPackClaimSafety(value, options);
}
