import type { PolicyPackControlPlaneRequirement } from '../manifest/policy-pack-manifest-types.js';
import type { ControlPlaneReference, FoundationRuntimeIntegrationStatus } from '../foundation/foundation-runtime-types.js';
import { findFoundationRuntimeCapabilityStatus } from '../foundation/foundation-runtime-capabilities.js';
import { evaluatePolicyPackClaimSafety } from '../validation/policy-pack-claim-safety.js';

export interface PolicyPackControlPlaneAdapter {
  toControlPlaneReferences(requirements: readonly PolicyPackControlPlaneRequirement[], sourcePackId?: string): ControlPlaneReference[];
}

/**
 * Maps `PolicyPackControlPlaneRequirement`s to `ControlPlaneReference`s.
 * Never renders UI and never calls the real AOC Control Plane -- it only
 * preserves safe display labels (dropping any that would fail claim-safety
 * scanning as defense in depth) for a real Control Plane surface to render
 * later.
 */
export function createPolicyPackControlPlaneAdapter(capabilities: readonly FoundationRuntimeIntegrationStatus[]): PolicyPackControlPlaneAdapter {
  const availability = findFoundationRuntimeCapabilityStatus(capabilities, 'control_plane')?.availability ?? 'missing';

  return {
    toControlPlaneReferences(requirements, sourcePackId) {
      return requirements.map((requirement) => {
        const status = availability === 'missing' || availability === 'disabled' ? 'not_available' : 'reference_only';
        const reference: ControlPlaneReference = {
          controlPlaneRef: requirement.runtimeRef ?? requirement.id,
          surface: requirement.surface,
          displaySafeLabels: requirement.safeDisplayLabels.filter((label) => evaluatePolicyPackClaimSafety(label).safe),
          status,
          ...(sourcePackId !== undefined ? { sourcePackId } : {}),
        };
        return reference;
      });
    },
  };
}
