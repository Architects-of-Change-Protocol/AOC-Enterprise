import { assertNoPMFreakDemoControlPlaneOverclaim, evaluatePMFreakDemoControlPlaneClaimSafety } from '../pmfreak-demo-control-plane-view/index.js';

/**
 * Narrative-export-specific unsafe claims, additive to (never replacing)
 * `PMFREAK_DEMO_CONTROL_PLANE_PROHIBITED_OVERCLAIM_PHRASES` from the Demo
 * Control Plane View, which is itself additive to the scenario-specific,
 * PMFreak-wide, and universal lists beneath it. This module extends the
 * Control Plane View's claim-safety wrapper -- the layer directly beneath
 * this export pack -- rather than reaching past it, so narrative export
 * output is checked against every layer: universal, PMFreak-wide,
 * scenario-specific, Control-Plane-view-specific, and narrative-specific.
 */
export const PMFREAK_DEMO_NARRATIVE_PROHIBITED_OVERCLAIM_PHRASES = [
  'invoice validity certified',
  'billing entitlement guaranteed',
  'customer acceptance legally sufficient',
  'project compliant',
] as const;

export interface PMFreakDemoNarrativeClaimSafetyResult {
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

function findNarrativeSpecificPhrases(value: unknown): string[] {
  const text = stringifyForScan(value).toLowerCase();
  return PMFREAK_DEMO_NARRATIVE_PROHIBITED_OVERCLAIM_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

/**
 * Evaluates claim safety for narrative export output, layering the
 * narrative-specific prohibited phrase list on top of
 * `evaluatePMFreakDemoControlPlaneClaimSafety` (which itself layers the
 * view-specific, scenario-specific, and PMFreak-wide lists on top of the
 * universal scan). Never calls a network or language model; a pure
 * deterministic string scan.
 */
export function evaluatePMFreakDemoNarrativeClaimSafety(value: unknown): PMFreakDemoNarrativeClaimSafetyResult {
  const controlPlaneWide = evaluatePMFreakDemoControlPlaneClaimSafety(value);
  const narrativeSpecificPhrasesFound = findNarrativeSpecificPhrases(value);

  return {
    safe: controlPlaneWide.safe && narrativeSpecificPhrasesFound.length === 0,
    prohibitedPhrasesFound: [...controlPlaneWide.prohibitedPhrasesFound, ...narrativeSpecificPhrasesFound],
    warnings: controlPlaneWide.warnings,
  };
}

/**
 * Asserts claim safety for narrative export output. Runs
 * `assertNoPMFreakDemoControlPlaneOverclaim` first (which itself always runs
 * every layer beneath it first), then additionally throws on any
 * narrative-specific unsafe claim.
 */
export function assertNoPMFreakDemoNarrativeOverclaim(value: unknown): void {
  assertNoPMFreakDemoControlPlaneOverclaim(value);

  const narrativeSpecificPhrasesFound = findNarrativeSpecificPhrases(value);
  if (narrativeSpecificPhrasesFound.length > 0) {
    throw new Error(`PMFreak demo narrative export overclaim detected: ${narrativeSpecificPhrasesFound.join(', ')}`);
  }
}
