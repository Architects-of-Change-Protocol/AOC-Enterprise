import type { ApprovalRuntimeReference, FoundationRuntimeIntegrationStatus } from '../../policy-pack-foundation/foundation/foundation-runtime-types.js';
import { createPolicyPackApprovalAdapter } from '../../policy-pack-foundation/adapters/policy-pack-approval-adapter.js';
import type { PolicyPackCompositionResult } from '../../policy-pack-foundation/composition/policy-pack-composition-types.js';

/**
 * Maps a jurisdiction composition's aggregated approval requirements to
 * `ApprovalRuntimeReference`s via the shared `createPolicyPackApprovalAdapter`.
 * There is no separate jurisdiction Approval Runtime here -- this module
 * never calls the real Approval Runtime, it only produces the same reference
 * records any other Foundation-aligned pack produces.
 */
export function mapJurisdictionResolutionToApproval(
  composition: PolicyPackCompositionResult,
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
): ApprovalRuntimeReference[] {
  const adapter = createPolicyPackApprovalAdapter(capabilities);
  return adapter.toApprovalRuntimeReferences(composition.requiredApprovals, composition.rootPackId);
}
