import { assertNoPMFreakScenarioOverclaim, evaluatePMFreakScenarioClaimSafety } from '../pmfreak-project-governance-scenarios/index.js';

/**
 * Control-Plane-view-specific unsafe claims, additive to (never replacing)
 * `PMFREAK_SCENARIO_PROHIBITED_OVERCLAIM_PHRASES` from the Project
 * Governance Scenario Pack, which is itself additive to the PMFreak-wide
 * list from the Agent Passport Demo Pack, which is itself additive to the
 * universal Policy Pack Foundation list. This module extends the scenario
 * pack's claim-safety wrapper -- the layer directly beneath this view --
 * rather than reaching past it, so Control Plane view output is checked
 * against every layer: universal, PMFreak-wide, scenario-specific, and
 * view-specific.
 */
export const PMFREAK_DEMO_CONTROL_PLANE_PROHIBITED_OVERCLAIM_PHRASES = [
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
] as const;

export interface PMFreakDemoControlPlaneClaimSafetyResult {
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

function findViewSpecificPhrases(value: unknown): string[] {
  const text = stringifyForScan(value).toLowerCase();
  return PMFREAK_DEMO_CONTROL_PLANE_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for Control Plane View output, layering the
 * view-specific prohibited phrase list on top of
 * `evaluatePMFreakScenarioClaimSafety` (which itself layers the
 * scenario-specific and PMFreak-wide lists on top of the universal scan).
 * Never calls a network or language model; a pure deterministic string
 * scan.
 */
export function evaluatePMFreakDemoControlPlaneClaimSafety(value: unknown): PMFreakDemoControlPlaneClaimSafetyResult {
  const scenarioWide = evaluatePMFreakScenarioClaimSafety(value);
  const viewSpecificPhrasesFound = findViewSpecificPhrases(value);

  return {
    safe: scenarioWide.safe && viewSpecificPhrasesFound.length === 0,
    prohibitedPhrasesFound: [...scenarioWide.prohibitedPhrasesFound, ...viewSpecificPhrasesFound],
    warnings: scenarioWide.warnings,
  };
}

/**
 * Asserts claim safety for Control Plane View output. Runs
 * `assertNoPMFreakScenarioOverclaim` first (which itself always runs the
 * PMFreak-wide and universal assertions first), then additionally throws on
 * any view-specific unsafe claim.
 */
export function assertNoPMFreakDemoControlPlaneOverclaim(value: unknown): void {
  assertNoPMFreakScenarioOverclaim(value);

  const viewSpecificPhrasesFound = findViewSpecificPhrases(value);
  if (viewSpecificPhrasesFound.length > 0) {
    throw new Error(`PMFreak demo Control Plane view overclaim detected: ${viewSpecificPhrasesFound.join(', ')}`);
  }
}
