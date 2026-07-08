import type { PolicyPackExportRequirement } from '../manifest/policy-pack-manifest-types.js';
import type { ExportRuntimeReference, FoundationRuntimeIntegrationStatus } from '../foundation/foundation-runtime-types.js';
import { findFoundationRuntimeCapabilityStatus } from '../foundation/foundation-runtime-capabilities.js';

export interface PolicyPackExportAdapter {
  toExportRuntimeReferences(requirements: readonly PolicyPackExportRequirement[], sourcePackId?: string): ExportRuntimeReference[];
}

const EXPORT_TYPE_MAP: Readonly<Record<PolicyPackExportRequirement['exportType'], ExportRuntimeReference['exportType']>> = {
  audit_bundle: 'audit_bundle',
  policy_decision: 'policy_decision',
  composition_bundle: 'composition_bundle',
  manifest_bundle: 'manifest_bundle',
  evidence_bundle: 'evidence_bundle',
  approval_bundle: 'audit_bundle',
};

/**
 * Maps `PolicyPackExportRequirement`s to `ExportRuntimeReference`s. Never
 * calls the real Verifiable Export Package runtime and never claims an
 * export bundle exists -- it does not set `status: 'available'` unless
 * the Verifiable Export Package capability itself is `available`, and even
 * then this adapter has not actually built anything, so it still reports
 * `reference_only`.
 */
export function createPolicyPackExportAdapter(capabilities: readonly FoundationRuntimeIntegrationStatus[]): PolicyPackExportAdapter {
  const availability = findFoundationRuntimeCapabilityStatus(capabilities, 'verifiable_export_package')?.availability ?? 'missing';

  return {
    toExportRuntimeReferences(requirements, sourcePackId) {
      return requirements.map((requirement) => {
        const status = availability === 'missing' || availability === 'disabled' ? 'not_available' : 'reference_only';
        const reference: ExportRuntimeReference = {
          exportRuntimeRef: requirement.runtimeRef ?? requirement.id,
          exportType: EXPORT_TYPE_MAP[requirement.exportType],
          required: requirement.required,
          status,
          ...(sourcePackId !== undefined ? { sourcePackId } : {}),
        };
        return reference;
      });
    },
  };
}
