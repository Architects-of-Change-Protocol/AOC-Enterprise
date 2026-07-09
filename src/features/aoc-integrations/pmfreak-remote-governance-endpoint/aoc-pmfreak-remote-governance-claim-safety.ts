import { evaluatePolicyPackClaimSafety } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';
import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import type { AocPMFreakRemoteGovernanceEndpointClaimSafetyResult } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Endpoint-specific unsafe claims, additive to (never replacing) the
 * universal `POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES`. These stay local to
 * this endpoint rather than being merged into the universal list -- generic
 * AOC runtimes must not depend on PMFreak-remote-governance-endpoint-specific
 * vocabulary. Identical to the phrase list the underlying AOC PMFreak
 * Governance Request Intake already enforces, so a request or response that
 * passes through both layers is checked against one consistent vocabulary.
 */
export const AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_PROHIBITED_OVERCLAIM_PHRASES = [
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
  'costa rica compliant',
  'cr compliant',
  'invoice validity certified',
  'billing entitlement guaranteed',
  'customer acceptance legally sufficient',
  'project compliant',
  'production execution approved',
  'action legally authorized',
  'contract violation detected',
  'invoice legally blocked',
  'customer acceptance invalid',
] as const;

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function findAocPMFreakRemoteGovernanceEndpointSpecificPhrases(normalizedText: string): string[] {
  return AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => normalizedText.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for AOC PMFreak Remote Governance Endpoint output,
 * layering the endpoint-specific prohibited phrase list on top of the
 * universal `evaluatePolicyPackClaimSafety`. Never calls a network or
 * language model; a pure deterministic string scan.
 */
export function evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety(value: unknown): AocPMFreakRemoteGovernanceEndpointClaimSafetyResult {
  const checkedText = stringifyForScan(value);
  const normalized = checkedText.toLowerCase();

  const universal = evaluatePolicyPackClaimSafety(value);
  const localPhrasesFound = findAocPMFreakRemoteGovernanceEndpointSpecificPhrases(normalized);

  const unsafePhrases = [...new Set([...universal.prohibitedPhrasesFound, ...localPhrasesFound])];

  return {
    safe: unsafePhrases.length === 0,
    unsafePhrases,
    checkedText,
  };
}

/**
 * Asserts claim safety for AOC PMFreak Remote Governance Endpoint output.
 * Runs the universal `assertNoPolicyPackOverclaim` first (throws on any
 * universal overclaim phrase), then additionally throws on any
 * endpoint-specific unsafe claim.
 */
export function assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(value: unknown): void {
  assertNoPolicyPackOverclaim(value);

  const normalized = stringifyForScan(value).toLowerCase();
  const localPhrasesFound = findAocPMFreakRemoteGovernanceEndpointSpecificPhrases(normalized);
  if (localPhrasesFound.length > 0) {
    throw new Error(`AOC PMFreak remote governance endpoint overclaim detected: ${localPhrasesFound.join(', ')}`);
  }
}
