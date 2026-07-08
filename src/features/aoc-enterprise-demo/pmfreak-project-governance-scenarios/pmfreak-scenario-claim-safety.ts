import { assertNoPMFreakAgentPassportOverclaim, evaluatePMFreakAgentPassportClaimSafety } from '../pmfreak-agent-passport/index.js';

/**
 * Project-Governance-Scenario-specific unsafe claims, additive to (never
 * replacing) `PMFREAK_PROHIBITED_OVERCLAIM_PHRASES` from the PMFreak Agent
 * Passport Demo Pack, which is itself additive to the universal Policy Pack
 * Foundation list. This module extends the PMFreak-specific claim-safety
 * wrapper from the previous PR rather than the generic Policy Pack
 * Foundation harness directly, so scenario output is checked against every
 * layer: universal, PMFreak-wide, and scenario-specific.
 */
export const PMFREAK_SCENARIO_PROHIBITED_OVERCLAIM_PHRASES = [
  'invoice ready certified',
  'customer acceptance certified',
  'fully governed',
  'guaranteed billing',
] as const;

export interface PMFreakScenarioClaimSafetyResult {
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

function findScenarioSpecificPhrases(value: unknown): string[] {
  const text = stringifyForScan(value).toLowerCase();
  return PMFREAK_SCENARIO_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for Project Governance Scenario Pack output,
 * layering the scenario-specific prohibited phrase list on top of
 * `evaluatePMFreakAgentPassportClaimSafety` (which itself layers the
 * PMFreak-wide list on top of the universal scan). Never calls a network or
 * language model; a pure deterministic string scan.
 */
export function evaluatePMFreakScenarioClaimSafety(value: unknown): PMFreakScenarioClaimSafetyResult {
  const pmfreakWide = evaluatePMFreakAgentPassportClaimSafety(value);
  const scenarioSpecificPhrasesFound = findScenarioSpecificPhrases(value);

  return {
    safe: pmfreakWide.safe && scenarioSpecificPhrasesFound.length === 0,
    prohibitedPhrasesFound: [...pmfreakWide.prohibitedPhrasesFound, ...scenarioSpecificPhrasesFound],
    warnings: pmfreakWide.warnings,
  };
}

/**
 * Asserts claim safety for Project Governance Scenario Pack output. Runs
 * `assertNoPMFreakAgentPassportOverclaim` first (which itself always runs
 * the universal `assertNoPolicyPackOverclaim` first), then additionally
 * throws on any scenario-specific unsafe claim.
 */
export function assertNoPMFreakScenarioOverclaim(value: unknown): void {
  assertNoPMFreakAgentPassportOverclaim(value);

  const scenarioSpecificPhrasesFound = findScenarioSpecificPhrases(value);
  if (scenarioSpecificPhrasesFound.length > 0) {
    throw new Error(`PMFreak project governance scenario overclaim detected: ${scenarioSpecificPhrasesFound.join(', ')}`);
  }
}
