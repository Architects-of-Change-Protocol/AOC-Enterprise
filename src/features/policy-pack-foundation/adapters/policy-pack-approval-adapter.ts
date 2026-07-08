import type { PolicyPackApprovalRequirement } from '../manifest/policy-pack-manifest-types.js';
import type { ApprovalRuntimeReference, FoundationRuntimeIntegrationStatus } from '../foundation/foundation-runtime-types.js';
import { findFoundationRuntimeCapabilityStatus } from '../foundation/foundation-runtime-capabilities.js';

export interface PolicyPackApprovalAdapter {
  toApprovalRuntimeReferences(requirements: readonly PolicyPackApprovalRequirement[], sourcePackId?: string): ApprovalRuntimeReference[];
}

/**
 * Maps `PolicyPackApprovalRequirement`s to `ApprovalRuntimeReference`s. Never
 * calls the real Approval Runtime and never claims a requirement has been
 * approved, rejected, or is even pending inside that runtime -- this adapter
 * only records the seam. Every reference is `reference_only` when the
 * Approval Runtime capability exists but has not actually been called, or
 * `not_available` when the capability itself is missing/disabled. Approving
 * or rejecting a requirement is the Approval Runtime's job, not this
 * adapter's.
 */
export function createPolicyPackApprovalAdapter(capabilities: readonly FoundationRuntimeIntegrationStatus[]): PolicyPackApprovalAdapter {
  const availability = findFoundationRuntimeCapabilityStatus(capabilities, 'approval_runtime')?.availability ?? 'missing';

  return {
    toApprovalRuntimeReferences(requirements, sourcePackId) {
      return requirements.map((requirement) => {
        const status = availability === 'missing' || availability === 'disabled' ? 'not_available' : 'reference_only';
        const reference: ApprovalRuntimeReference = {
          approvalRuntimeRef: requirement.runtimeRef ?? requirement.id,
          reviewType: requirement.reviewType,
          required: requirement.required,
          status,
          ...(sourcePackId !== undefined ? { sourcePackId } : {}),
          ...(requirement.reasonCode !== undefined ? { reasonCode: requirement.reasonCode } : {}),
        };
        return reference;
      });
    },
  };
}
