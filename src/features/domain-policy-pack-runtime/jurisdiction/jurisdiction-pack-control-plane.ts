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

/**
 * Builds a Control Plane summary for a jurisdiction composition using the
 * shared `createPolicyPackControlPlaneAdapter` -- never a jurisdiction-only
 * rendering path. `JURISDICTION_CONTROL_PLANE_SAFE_LABELS` never claims legal
 * compliance, jurisdictional compliance, or completeness; the result is
 * still scanned with `assertNoPolicyPackOverclaim` before being returned as
 * defense in depth.
 */
export function createJurisdictionControlPlaneSummary(input: CreateJurisdictionControlPlaneSummaryInput): JurisdictionControlPlaneSummary {
  const requirement: PolicyPackControlPlaneRequirement = {
    id: `${input.composition.rootPackId}.control-plane`,
    surface: 'policy_pack',
    required: true,
    safeDisplayLabels: JURISDICTION_CONTROL_PLANE_SAFE_LABELS,
  };

  const adapter = createPolicyPackControlPlaneAdapter(input.capabilities);
  const [reference] = adapter.toControlPlaneReferences([requirement], input.composition.rootPackId);

  const summary: JurisdictionControlPlaneSummary = {
    rootPackId: input.composition.rootPackId,
    surface: 'jurisdiction_pack',
    displaySafeLabels: reference?.displaySafeLabels ?? [],
    status: reference?.status ?? 'not_available',
  };

  assertNoPolicyPackOverclaim(summary);
  return summary;
}
