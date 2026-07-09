import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { evaluatePolicyPackClaimSafety } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';

/**
 * PMFreak Read-Only Connector-specific unsafe claims, additive to (never
 * replacing) the universal Policy Pack Foundation list. This connector does
 * not depend on `src/features/aoc-enterprise-demo/pmfreak-agent-passport`
 * or any of its sibling PMFreak demo packs -- it is a new, separate
 * integration boundary -- so this module layers directly on the universal
 * Policy Pack Foundation claim-safety harness, following the same
 * "layer directly on the universal harness, carry a local phrase list"
 * convention already used by the Project Governance Scenario, Control
 * Plane View, and Narrative Export packs.
 */
export const AOC_PMFREAK_READ_ONLY_CONNECTOR_PROHIBITED_OVERCLAIM_PHRASES = [
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
  'production connector certified',
  'write access enabled',
  'mutation allowed',
  'certified pmfreak connector',
] as const;

export interface AocPMFreakReadOnlyConnectorClaimSafetyResult {
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

function findConnectorSpecificPhrases(value: unknown): string[] {
  const text = stringifyForScan(value).toLowerCase();
  return AOC_PMFREAK_READ_ONLY_CONNECTOR_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for PMFreak Read-Only Connector output (descriptor,
 * config, snapshot, health, errors, README examples), layering the
 * connector-specific prohibited phrase list on top of
 * `evaluatePolicyPackClaimSafety` (the universal scan). Never calls a
 * network or language model; a pure deterministic string scan.
 */
export function evaluateAocPMFreakReadOnlyConnectorClaimSafety(value: unknown): AocPMFreakReadOnlyConnectorClaimSafetyResult {
  const universal = evaluatePolicyPackClaimSafety(value);
  const connectorSpecificPhrasesFound = findConnectorSpecificPhrases(value);

  return {
    safe: universal.safe && connectorSpecificPhrasesFound.length === 0,
    prohibitedPhrasesFound: [...universal.prohibitedPhrasesFound, ...connectorSpecificPhrasesFound],
    warnings: universal.warnings,
  };
}

/**
 * Asserts claim safety for PMFreak Read-Only Connector output. Runs
 * `assertNoPolicyPackOverclaim` first (the universal assertion), then
 * additionally throws on any connector-specific unsafe claim.
 */
export function assertNoAocPMFreakReadOnlyConnectorOverclaim(value: unknown): void {
  assertNoPolicyPackOverclaim(value);

  const connectorSpecificPhrasesFound = findConnectorSpecificPhrases(value);
  if (connectorSpecificPhrasesFound.length > 0) {
    throw new Error(`AOC PMFreak Read-Only Connector overclaim detected: ${connectorSpecificPhrasesFound.join(', ')}`);
  }
}
