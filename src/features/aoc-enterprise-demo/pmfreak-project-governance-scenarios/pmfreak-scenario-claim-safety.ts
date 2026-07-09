import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { evaluatePolicyPackClaimSafety } from '../../policy-pack-foundation/validation/policy-pack-claim-safety.js';

/**
 * Project-Governance-Scenario-specific unsafe claims, additive to (never
 * replacing) the universal Policy Pack Foundation list. This pack no longer
 * depends on `src/features/aoc-enterprise-demo/pmfreak-agent-passport` (its
 * demo resolver has been replaced by the real
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` package, see
 * `pmfreak-scenario-runner.ts`), so this module layers directly on the
 * universal Policy Pack Foundation claim-safety harness rather than through
 * that demo pack's own wrapper -- but it still carries a copy of that demo
 * pack's own PMFreak-wide prohibited-phrase list (`PMFREAK_PROHIBITED_OVERCLAIM_PHRASES`
 * in `pmfreak-agent-passport/pmfreak-claim-safety.ts`) below, so dropping the
 * import doesn't silently drop that coverage: scenario run/export/manifest
 * output must still never claim to be, e.g., a "fully trusted agent" or
 * "production authorized", even though this pack no longer imports the demo
 * pack's resolver or its claim-safety wrapper.
 */
export const PMFREAK_SCENARIO_PROHIBITED_OVERCLAIM_PHRASES = [
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
 * `evaluatePolicyPackClaimSafety` (the universal scan). Never calls a
 * network or language model; a pure deterministic string scan.
 */
export function evaluatePMFreakScenarioClaimSafety(value: unknown): PMFreakScenarioClaimSafetyResult {
  const universal = evaluatePolicyPackClaimSafety(value);
  const scenarioSpecificPhrasesFound = findScenarioSpecificPhrases(value);

  return {
    safe: universal.safe && scenarioSpecificPhrasesFound.length === 0,
    prohibitedPhrasesFound: [...universal.prohibitedPhrasesFound, ...scenarioSpecificPhrasesFound],
    warnings: universal.warnings,
  };
}

/**
 * Asserts claim safety for Project Governance Scenario Pack output. Runs
 * `assertNoPolicyPackOverclaim` first (the universal assertion), then
 * additionally throws on any scenario-specific unsafe claim.
 */
export function assertNoPMFreakScenarioOverclaim(value: unknown): void {
  assertNoPolicyPackOverclaim(value);

  const scenarioSpecificPhrasesFound = findScenarioSpecificPhrases(value);
  if (scenarioSpecificPhrasesFound.length > 0) {
    throw new Error(`PMFreak project governance scenario overclaim detected: ${scenarioSpecificPhrasesFound.join(', ')}`);
  }
}
