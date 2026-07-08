import type {
  FoundationRuntimeAlignmentReport,
  FoundationRuntimeAlignmentStatus,
  FoundationRuntimeCapability,
  FoundationRuntimeIntegrationStatus,
  FoundationRuntimeReferenceMap,
} from './foundation-runtime-types.js';
import { validateFoundationRuntimeReferences } from './foundation-runtime-validation.js';

function capabilitiesWithAvailability(capabilities: readonly FoundationRuntimeIntegrationStatus[], availability: FoundationRuntimeIntegrationStatus['availability']): FoundationRuntimeCapability[] {
  return capabilities.filter((status) => status.availability === availability).map((status) => status.capability);
}

function deriveAlignmentStatus(
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
  referenceValidationErrors: readonly string[],
): FoundationRuntimeAlignmentStatus {
  if (referenceValidationErrors.length > 0) return 'blocked';

  const requiredCapabilities: readonly FoundationRuntimeCapability[] = ['policy_pack_manifest_standard', 'policy_pack_composition_runtime', 'policy_pack_validation_harness'];
  const missingRequired = requiredCapabilities.some((capability) => {
    const status = capabilities.find((entry) => entry.capability === capability);
    return status === undefined || status.availability === 'missing' || status.availability === 'disabled';
  });
  if (missingRequired) return 'missing_required_capabilities';

  const hasReferenceOnly = capabilities.some((status) => status.availability === 'reference_only' || status.availability === 'planned');
  return hasReferenceOnly ? 'aligned_with_reference_only_integrations' : 'aligned';
}

/**
 * Produces a truthful, deterministic snapshot of Foundation capability
 * alignment. `generatedAt` is never stamped from the system clock here --
 * this function has no clock of its own, so the report simply omits
 * `generatedAt`. A caller with a deterministic clock can attach a timestamp
 * afterwards.
 */
export function createFoundationRuntimeAlignmentReport(
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
  referenceMap?: FoundationRuntimeReferenceMap,
): FoundationRuntimeAlignmentReport {
  const referenceValidation = referenceMap !== undefined ? validateFoundationRuntimeReferences(referenceMap, capabilities) : undefined;

  const warnings = [...(referenceValidation?.warnings ?? [])];
  const errors = [...(referenceValidation?.errors ?? [])];

  const missingCapabilities = capabilitiesWithAvailability(capabilities, 'missing');
  if (missingCapabilities.length > 0) {
    warnings.push(`Missing Foundation capabilities are not available: ${missingCapabilities.join(', ')}.`);
  }

  const report: FoundationRuntimeAlignmentReport = {
    status: deriveAlignmentStatus(capabilities, errors),
    availableCapabilities: capabilitiesWithAvailability(capabilities, 'available'),
    referenceOnlyCapabilities: capabilitiesWithAvailability(capabilities, 'reference_only'),
    plannedCapabilities: capabilitiesWithAvailability(capabilities, 'planned'),
    missingCapabilities,
    disabledCapabilities: capabilitiesWithAvailability(capabilities, 'disabled'),
    warnings,
    errors,
  };

  return report;
}
