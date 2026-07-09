import { evaluatePolicyPackClaimSafety } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';
import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import type { AocPMFreakGovernanceIntakeClaimSafetyResult } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Intake-specific unsafe claims, additive to (never replacing) the universal
 * `POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES`. These stay local to this
 * intake rather than being merged into the universal list -- generic AOC
 * runtimes must not depend on PMFreak-governance-intake-specific vocabulary.
 */
export const AOC_PMFREAK_GOVERNANCE_INTAKE_PROHIBITED_OVERCLAIM_PHRASES = [
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

function findAocPMFreakGovernanceIntakeSpecificPhrases(normalizedText: string): string[] {
  return AOC_PMFREAK_GOVERNANCE_INTAKE_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => normalizedText.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for AOC PMFreak Governance Request Intake output,
 * layering the intake-specific prohibited phrase list on top of the
 * universal `evaluatePolicyPackClaimSafety`. Never calls a network or
 * language model; a pure deterministic string scan.
 */
export function evaluateAocPMFreakGovernanceIntakeClaimSafety(value: unknown): AocPMFreakGovernanceIntakeClaimSafetyResult {
  const checkedText = stringifyForScan(value);
  const normalized = checkedText.toLowerCase();

  const universal = evaluatePolicyPackClaimSafety(value);
  const localPhrasesFound = findAocPMFreakGovernanceIntakeSpecificPhrases(normalized);

  const unsafePhrases = [...new Set([...universal.prohibitedPhrasesFound, ...localPhrasesFound])];

  return {
    safe: unsafePhrases.length === 0,
    unsafePhrases,
    checkedText,
  };
}

/**
 * Asserts claim safety for AOC PMFreak Governance Request Intake output.
 * Runs the universal `assertNoPolicyPackOverclaim` first (throws on any
 * universal overclaim phrase), then additionally throws on any
 * intake-specific unsafe claim.
 */
export function assertNoAocPMFreakGovernanceIntakeOverclaim(value: unknown): void {
  assertNoPolicyPackOverclaim(value);

  const normalized = stringifyForScan(value).toLowerCase();
  const localPhrasesFound = findAocPMFreakGovernanceIntakeSpecificPhrases(normalized);
  if (localPhrasesFound.length > 0) {
    throw new Error(`AOC PMFreak governance intake overclaim detected: ${localPhrasesFound.join(', ')}`);
  }
}
