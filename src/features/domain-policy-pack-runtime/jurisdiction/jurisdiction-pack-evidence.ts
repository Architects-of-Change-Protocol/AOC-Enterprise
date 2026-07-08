import type { EvidenceRuntimeReference, FoundationRuntimeIntegrationStatus } from '../../policy-pack-foundation/foundation/foundation-runtime-types.js';
import { createPolicyPackEvidenceAdapter } from '../../policy-pack-foundation/adapters/policy-pack-evidence-adapter.js';
import type { PolicyPackCompositionResult } from '../../policy-pack-foundation/composition/policy-pack-composition-types.js';

/**
 * Maps a jurisdiction composition's aggregated evidence requirements to
 * `EvidenceRuntimeReference`s via the shared `createPolicyPackEvidenceAdapter`.
 * There is no separate jurisdiction Evidence Runtime here -- this module
 * never calls the real Evidence / Source / Citation Runtime, it only
 * produces the same reference records any other Foundation-aligned pack
 * produces.
 */
export function mapJurisdictionResolutionToEvidenceRequirements(
  composition: PolicyPackCompositionResult,
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
): EvidenceRuntimeReference[] {
  const adapter = createPolicyPackEvidenceAdapter(capabilities);
  return adapter.toEvidenceRuntimeReferences(composition.requiredEvidence, composition.rootPackId);
}
