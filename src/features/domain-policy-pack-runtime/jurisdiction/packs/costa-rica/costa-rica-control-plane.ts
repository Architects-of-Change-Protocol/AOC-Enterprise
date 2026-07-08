import type { PolicyPackControlPlaneRequirement } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { FoundationRuntimeIntegrationStatus } from '../../../../policy-pack-foundation/foundation/foundation-runtime-types.js';
import type { PolicyPackCompositionResult } from '../../../../policy-pack-foundation/composition/policy-pack-composition-types.js';
import { assertNoPolicyPackOverclaim } from '../../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { createJurisdictionControlPlaneSummary } from '../../jurisdiction-pack-control-plane.js';
import type { JurisdictionControlPlaneSummary } from '../../jurisdiction-pack-control-plane.js';
import { COSTA_RICA_BASE_PACK_ID } from './costa-rica-constants.js';

/**
 * Safe, natural-language Control Plane labels for the Costa Rica Base Pack.
 * Every label is checked by this pack's own tests against
 * `evaluatePolicyPackClaimSafety` -- none claims Costa Rica compliance,
 * jurisdictional compliance, or legal completeness.
 */
export const COSTA_RICA_CONTROL_PLANE_SAFE_LABELS = [
  'Costa Rica jurisdiction context',
  'Jurisdiction awareness',
  'Not legal advice',
  'Partial policy model',
  'No Costa Rica compliance claimed',
  'No jurisdiction-specific compliance claimed',
  'Requires customer validation',
  'Requires counsel review when applicable',
  'Evidence required',
  'Approval required',
] as const;

/**
 * The Control Plane requirement carried on the Costa Rica Base Pack manifest
 * itself, so `composePolicyPacks` aggregates it into
 * `requiredControlPlaneSurfaces` like any other pack-specific surface.
 */
export const COSTA_RICA_CONTROL_PLANE_REQUIREMENT: PolicyPackControlPlaneRequirement = {
  id: `${COSTA_RICA_BASE_PACK_ID}.control-plane`,
  surface: 'policy_pack',
  required: true,
  safeDisplayLabels: COSTA_RICA_CONTROL_PLANE_SAFE_LABELS,
};

export interface CreateCostaRicaControlPlaneSummaryInput {
  readonly composition: PolicyPackCompositionResult;
  readonly capabilities: readonly FoundationRuntimeIntegrationStatus[];
}

/**
 * Builds a Control Plane summary for a Costa Rica composition. This is a
 * thin delegation to the shared `createJurisdictionControlPlaneSummary` --
 * it never renders UI, never calls a real Control Plane, and never invents a
 * jurisdiction-only rendering path. The result is scanned with
 * `assertNoPolicyPackOverclaim` here too, as defense in depth on top of the
 * shared function's own scan.
 */
export function createCostaRicaControlPlaneSummary(input: CreateCostaRicaControlPlaneSummaryInput): JurisdictionControlPlaneSummary {
  const summary = createJurisdictionControlPlaneSummary(input);
  assertNoPolicyPackOverclaim(summary);
  return summary;
}
