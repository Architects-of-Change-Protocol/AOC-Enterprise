import type {
  ControlPlaneReference,
  FoundationRuntimeCapability,
  FoundationRuntimeIntegrationStatus,
  FoundationRuntimeReferenceMap,
  FoundationRuntimeValidationResult,
} from './foundation-runtime-types.js';
import { findFoundationRuntimeCapabilityStatus } from './foundation-runtime-capabilities.js';

/** Reference statuses, per category, that assert a real runtime actually produced a result. */
const EXECUTION_CLAIMING_STATUSES: Readonly<Record<string, readonly string[]>> = {
  approval: ['pending', 'approved', 'rejected'],
  evidence: ['present', 'missing'],
  source: ['present', 'missing'],
  citation: ['present', 'missing'],
  proof: ['present', 'missing'],
  export: ['available'],
  controlPlane: ['available'],
};

interface ReferenceCheck {
  readonly category: keyof FoundationRuntimeReferenceMap;
  readonly capability: FoundationRuntimeCapability;
  readonly idField: string;
  readonly id: string;
  readonly required: boolean;
  readonly status: string;
}

function collectReferenceChecks(referenceMap: FoundationRuntimeReferenceMap): ReferenceCheck[] {
  const checks: ReferenceCheck[] = [];
  for (const ref of referenceMap.approval ?? []) {
    checks.push({ category: 'approval', capability: 'approval_runtime', idField: 'approvalRuntimeRef', id: ref.approvalRuntimeRef, required: ref.required, status: ref.status });
  }
  for (const ref of referenceMap.evidence ?? []) {
    checks.push({ category: 'evidence', capability: 'evidence_runtime', idField: 'evidenceRuntimeRef', id: ref.evidenceRuntimeRef, required: ref.required, status: ref.status });
  }
  for (const ref of referenceMap.source ?? []) {
    checks.push({ category: 'source', capability: 'source_runtime', idField: 'sourceRuntimeRef', id: ref.sourceRuntimeRef, required: ref.required, status: ref.status });
  }
  for (const ref of referenceMap.citation ?? []) {
    checks.push({ category: 'citation', capability: 'citation_runtime', idField: 'citationRuntimeRef', id: ref.citationRuntimeRef, required: ref.required, status: ref.status });
  }
  for (const ref of referenceMap.proof ?? []) {
    checks.push({ category: 'proof', capability: 'proof_runtime', idField: 'proofRuntimeRef', id: ref.proofRuntimeRef, required: ref.required, status: ref.status });
  }
  for (const ref of referenceMap.export ?? []) {
    checks.push({ category: 'export', capability: 'verifiable_export_package', idField: 'exportRuntimeRef', id: ref.exportRuntimeRef, required: ref.required, status: ref.status });
  }
  for (const ref of referenceMap.controlPlane ?? []) {
    // ControlPlaneReference has no `required` flag; a Control Plane reference always needs an id.
    checks.push({ category: 'controlPlane', capability: 'control_plane', idField: 'controlPlaneRef', id: ref.controlPlaneRef, required: true, status: ref.status });
  }
  return checks;
}

function isDisplaySafe(ref: ControlPlaneReference): boolean {
  return ref.displaySafeLabels.every((label) => label.trim().length > 0);
}

/**
 * Validates a `FoundationRuntimeReferenceMap` against the real Foundation
 * capability statuses. This never executes a runtime -- it only checks that
 * the reference map is not claiming more than the underlying capabilities
 * actually support.
 */
export function validateFoundationRuntimeReferences(
  referenceMap: FoundationRuntimeReferenceMap,
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
): FoundationRuntimeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const check of collectReferenceChecks(referenceMap)) {
    const capabilityStatus = findFoundationRuntimeCapabilityStatus(capabilities, check.capability);
    const availability = capabilityStatus?.availability ?? 'missing';

    if (check.required && check.id.trim().length === 0) {
      errors.push(`${check.category} reference is required but has no ${check.idField}.`);
    }

    const claimsExecution = (EXECUTION_CLAIMING_STATUSES[check.category] ?? []).includes(check.status);

    if (availability !== 'available' && claimsExecution) {
      errors.push(
        `${check.category} reference "${check.id || '(missing id)'}" has status "${check.status}" but capability "${check.capability}" is "${availability}"; an unavailable runtime cannot be treated as available.`,
      );
      continue;
    }

    if (availability === 'reference_only' || availability === 'planned') {
      warnings.push(`${check.category} reference "${check.id || '(missing id)'}" is backed by a "${availability}" capability; no actual ${check.category} execution is being claimed.`);
    }

    if (availability === 'missing' || availability === 'disabled') {
      warnings.push(`${check.category} reference "${check.id || '(missing id)'}" is backed by a "${availability}" capability.`);
    }
  }

  for (const ref of referenceMap.controlPlane ?? []) {
    if (ref.displaySafeLabels.length === 0) {
      warnings.push(`Control Plane reference "${ref.controlPlaneRef}" has no displaySafeLabels; nothing is guaranteed safe to display.`);
    } else if (!isDisplaySafe(ref)) {
      errors.push(`Control Plane reference "${ref.controlPlaneRef}" has a blank displaySafeLabels entry.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
