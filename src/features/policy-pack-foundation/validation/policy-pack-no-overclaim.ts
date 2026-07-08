import { evaluatePolicyPackClaimSafety } from './policy-pack-claim-safety.js';

/**
 * Test/assertion helper: stringifies `value` and throws if any prohibited
 * overclaim phrase is present (after stripping known safe disclaimers).
 * Intended for use across manifests, validation results, composition
 * results, foundation alignment reports, and every reference/adapter output
 * this module produces.
 */
export function assertNoPolicyPackOverclaim(value: unknown): void {
  const result = evaluatePolicyPackClaimSafety(value);
  if (!result.safe) {
    throw new Error(`Policy pack overclaim detected: ${result.prohibitedPhrasesFound.join(', ')}`);
  }
}
