import type { PolicyPackEvidenceRequirement } from '../manifest/policy-pack-manifest-types.js';
import type { EvidenceRuntimeReference, FoundationRuntimeIntegrationStatus } from '../foundation/foundation-runtime-types.js';
import { findFoundationRuntimeCapabilityStatus } from '../foundation/foundation-runtime-capabilities.js';

export interface PolicyPackEvidenceAdapter {
  toEvidenceRuntimeReferences(requirements: readonly PolicyPackEvidenceRequirement[], sourcePackId?: string): EvidenceRuntimeReference[];
}

/**
 * Maps `PolicyPackEvidenceRequirement`s to `EvidenceRuntimeReference`s,
 * preserving the requirement's own source/citation/proof runtime references.
 * Never calls the real Evidence / Source / Citation Runtime and never claims
 * evidence is `present` -- that determination belongs to the Evidence
 * Runtime, not this adapter.
 */
export function createPolicyPackEvidenceAdapter(capabilities: readonly FoundationRuntimeIntegrationStatus[]): PolicyPackEvidenceAdapter {
  const availability = findFoundationRuntimeCapabilityStatus(capabilities, 'evidence_runtime')?.availability ?? 'missing';

  return {
    toEvidenceRuntimeReferences(requirements, sourcePackId) {
      return requirements.map((requirement) => {
        const status = availability === 'missing' || availability === 'disabled' ? 'not_available' : 'reference_only';
        const reference: EvidenceRuntimeReference = {
          evidenceRuntimeRef: requirement.runtimeRef ?? requirement.id,
          evidenceType: requirement.evidenceType,
          required: requirement.required,
          status,
          ...(sourcePackId !== undefined ? { sourcePackId } : {}),
          ...(requirement.sourceRuntimeRef !== undefined ? { sourceId: requirement.sourceRuntimeRef } : {}),
          ...(requirement.citationRuntimeRef !== undefined ? { citationId: requirement.citationRuntimeRef } : {}),
          ...(requirement.proofRuntimeRef !== undefined ? { proofId: requirement.proofRuntimeRef } : {}),
        };
        return reference;
      });
    },
  };
}
