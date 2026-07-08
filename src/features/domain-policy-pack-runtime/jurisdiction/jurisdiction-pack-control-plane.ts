import type { ControlPlaneReferenceStatus, FoundationRuntimeIntegrationStatus } from '../../policy-pack-foundation/foundation/foundation-runtime-types.js';
import { createPolicyPackControlPlaneAdapter } from '../../policy-pack-foundation/adapters/policy-pack-control-plane-adapter.js';
import type { PolicyPackControlPlaneRequirement } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { PolicyPackCompositionResult } from '../../policy-pack-foundation/composition/policy-pack-composition-types.js';
import { assertNoPolicyPackOverclaim } from '../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { JURISDICTION_CONTROL_PLANE_SAFE_LABELS } from './jurisdiction-pack-constants.js';

export interface CreateJurisdictionControlPlaneSummaryInput {
  readonly composition: PolicyPackCompositionResult;
  readonly capabilities: readonly FoundationRuntimeIntegrationStatus[];
}

export interface JurisdictionControlPlaneSummary {
  readonly rootPackId: string;
  readonly surface: 'jurisdiction_pack';
  readonly displaySafeLabels: readonly string[];
  readonly status: ControlPlaneReferenceStatus;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Builds a Control Plane summary for a jurisdiction composition using the
 * shared `createPolicyPackControlPlaneAdapter` -- never a jurisdiction-only
 * rendering path. Maps every Control Plane requirement the composition
 * already aggregated (`composition.requiredControlPlaneSurfaces`, from every
 * included pack's manifest) alongside a synthetic jurisdiction-labels
 * requirement, so pack-specific surfaces/labels are never silently dropped.
 * `JURISDICTION_CONTROL_PLANE_SAFE_LABELS` never claims legal compliance,
 * jurisdictional compliance, or completeness; the result is still scanned
 * with `assertNoPolicyPackOverclaim` before being returned as defense in
 * depth.
 */
export function createJurisdictionControlPlaneSummary(input: CreateJurisdictionControlPlaneSummaryInput): JurisdictionControlPlaneSummary {
  const syntheticRequirement: PolicyPackControlPlaneRequirement = {
    id: `${input.composition.rootPackId}.control-plane`,
    surface: 'policy_pack',
    required: true,
    safeDisplayLabels: JURISDICTION_CONTROL_PLANE_SAFE_LABELS,
  };

  const adapter = createPolicyPackControlPlaneAdapter(input.capabilities);
  const references = adapter.toControlPlaneReferences([...input.composition.requiredControlPlaneSurfaces, syntheticRequirement], input.composition.rootPackId);

  const summary: JurisdictionControlPlaneSummary = {
    rootPackId: input.composition.rootPackId,
    surface: 'jurisdiction_pack',
    displaySafeLabels: dedupe(references.flatMap((reference) => reference.displaySafeLabels)),
    // Every reference here is produced from the same capabilities/adapter call, so their
    // statuses are identical -- there is no partial-availability case to reconcile.
    status: references[0]?.status ?? 'not_available',
  };

  assertNoPolicyPackOverclaim(summary);
  return summary;
}
