import { evaluatePolicyPackClaimSafety } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';
import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';

/**
 * PMFreak-specific unsafe claims, additive to (never replacing)
 * `POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES`. These stay local to this pack
 * rather than being merged into the universal Policy Pack Foundation list --
 * generic AOC runtimes must not depend on PMFreak-specific vocabulary. See
 * `buildClaimProfile` in `policy-pack-manifest-factory.ts` for the same
 * "universal baseline stays universal, pack-specific claims stay local"
 * convention applied to manifest claim profiles.
 */
export const PMFREAK_PROHIBITED_OVERCLAIM_PHRASES = [
  'fully trusted agent',
  'autonomous approval granted',
  'certified enterprise compliant',
  'risk-free execution',
  'production authorized',
  'invoice-ready certified',
  'contractually compliant',
  'guaranteed safe',
  'legally approved',
  'compliance passed',
] as const;

export interface PMFreakClaimSafetyResult {
  readonly safe: boolean;
  readonly prohibitedPhrasesFound: readonly string[];
  readonly warnings: readonly string[];
}

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function findPMFreakSpecificPhrases(value: unknown): string[] {
  const text = stringifyForScan(value).toLowerCase();
  return PMFREAK_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for PMFreak Agent Passport Demo Pack output,
 * layering the PMFreak-specific prohibited phrase list on top of the
 * universal `evaluatePolicyPackClaimSafety`. Never calls a network or
 * language model; a pure deterministic string scan.
 */
export function evaluatePMFreakAgentPassportClaimSafety(value: unknown): PMFreakClaimSafetyResult {
  const universal = evaluatePolicyPackClaimSafety(value);
  const pmfreakSpecificPhrasesFound = findPMFreakSpecificPhrases(value);

  return {
    safe: universal.safe && pmfreakSpecificPhrasesFound.length === 0,
    prohibitedPhrasesFound: [...universal.prohibitedPhrasesFound, ...pmfreakSpecificPhrasesFound],
    warnings: universal.warnings,
  };
}

/**
 * Asserts claim safety for PMFreak Agent Passport Demo Pack output. Runs the
 * universal `assertNoPolicyPackOverclaim` first (throws on any universal
 * overclaim phrase), then additionally throws on any PMFreak-specific
 * unsafe claim.
 */
export function assertNoPMFreakAgentPassportOverclaim(value: unknown): void {
  assertNoPolicyPackOverclaim(value);

  const pmfreakSpecificPhrasesFound = findPMFreakSpecificPhrases(value);
  if (pmfreakSpecificPhrasesFound.length > 0) {
    throw new Error(`PMFreak agent passport overclaim detected: ${pmfreakSpecificPhrasesFound.join(', ')}`);
  }
}
