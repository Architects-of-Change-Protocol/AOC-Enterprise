import {
  composePolicyPacks,
  createPolicyPackApprovalAdapter,
  createPolicyPackControlPlaneAdapter,
  createPolicyPackEvidenceAdapter,
  createPolicyPackExportAdapter,
  evaluatePolicyPackClaimSafety,
  type FoundationRuntimeIntegrationStatus,
  type PolicyPackApprovalAdapter,
  type PolicyPackControlPlaneAdapter,
  type PolicyPackEvidenceAdapter,
  type PolicyPackExportAdapter,
} from '../../policy-pack-foundation/index.js';
import type { JurisdictionResolutionInput, JurisdictionResolutionResult } from '../domain/jurisdiction-pack-runtime-types.js';
import { resolveJurisdictionPacks } from '../services/jurisdiction-pack-resolver.js';
import type { JurisdictionPackRegistry } from '../services/jurisdiction-pack-registry.js';
import { JurisdictionPackRuntimeError } from './jurisdiction-pack-runtime-errors.js';

/**
 * Orchestrates jurisdiction pack resolution on top of the Policy Pack
 * Foundation. This class holds no manifest, validation-status, safe-framing,
 * composition, no-overclaim, or reference-mapping logic of its own -- it
 * only resolves a jurisdiction code to a registered manifest and delegates
 * composition and reference-mapping to `composePolicyPacks` and the
 * Foundation's own approval/evidence/export/control-plane adapters.
 */
export class JurisdictionPackRuntime {
  private readonly registry: JurisdictionPackRegistry;
  private readonly approvalAdapter: PolicyPackApprovalAdapter;
  private readonly evidenceAdapter: PolicyPackEvidenceAdapter;
  private readonly exportAdapter: PolicyPackExportAdapter;
  private readonly controlPlaneAdapter: PolicyPackControlPlaneAdapter;

  constructor(registry: JurisdictionPackRegistry, capabilities: readonly FoundationRuntimeIntegrationStatus[]) {
    this.registry = registry;
    this.approvalAdapter = createPolicyPackApprovalAdapter(capabilities);
    this.evidenceAdapter = createPolicyPackEvidenceAdapter(capabilities);
    this.exportAdapter = createPolicyPackExportAdapter(capabilities);
    this.controlPlaneAdapter = createPolicyPackControlPlaneAdapter(capabilities);
  }

  resolve(input: JurisdictionResolutionInput): JurisdictionResolutionResult {
    const resolution = resolveJurisdictionPacks(this.registry, input.jurisdictionCode);

    if (resolution.status === 'unresolved') {
      return {
        status: 'unresolved',
        jurisdictionCode: input.jurisdictionCode,
        matchedPackIds: [],
        approvalReferences: [],
        evidenceReferences: [],
        exportReferences: [],
        controlPlaneReferences: [],
        warnings: [],
        errors: [`No active jurisdiction pack is registered for jurisdiction code "${input.jurisdictionCode}".`],
      };
    }

    if (resolution.status === 'ambiguous') {
      return {
        status: 'ambiguous',
        jurisdictionCode: input.jurisdictionCode,
        matchedPackIds: resolution.matchedPackIds,
        approvalReferences: [],
        evidenceReferences: [],
        exportReferences: [],
        controlPlaneReferences: [],
        warnings: [`Jurisdiction code "${input.jurisdictionCode}" matches more than one active jurisdiction pack: ${resolution.matchedPackIds.join(', ')}. Disambiguate with rootPackId.`],
        errors: [],
      };
    }

    const [resolvedPackId] = resolution.matchedPackIds;
    if (resolvedPackId === undefined) {
      throw new JurisdictionPackRuntimeError(`Resolved jurisdiction code "${input.jurisdictionCode}" unexpectedly produced no pack id.`);
    }
    const rootPackId = input.rootPackId ?? resolvedPackId;
    const compositionId = input.compositionId ?? `jurisdiction-resolution:${input.jurisdictionCode}:${rootPackId}`;

    const composition = composePolicyPacks({
      compositionId,
      rootPackId,
      requestedPackIds: [rootPackId, ...(input.requestedPackIds ?? [])],
      availableManifests: [...this.registry.allManifests(), ...(input.availableManifests ?? [])],
      ...(input.requiredValidationStatus !== undefined ? { requiredValidationStatus: input.requiredValidationStatus } : {}),
    });

    const warnings = [...composition.warnings];
    const errors = [...composition.errors];

    const claimSafety = evaluatePolicyPackClaimSafety(composition);
    if (!claimSafety.safe) {
      errors.push(`Composition for jurisdiction "${input.jurisdictionCode}" contains prohibited overclaim phrases: ${claimSafety.prohibitedPhrasesFound.join(', ')}.`);
    }

    return {
      status: 'resolved',
      jurisdictionCode: input.jurisdictionCode,
      matchedPackIds: resolution.matchedPackIds,
      composition,
      approvalReferences: this.approvalAdapter.toApprovalRuntimeReferences(composition.requiredApprovals, rootPackId),
      evidenceReferences: this.evidenceAdapter.toEvidenceRuntimeReferences(composition.requiredEvidence, rootPackId),
      exportReferences: this.exportAdapter.toExportRuntimeReferences(composition.requiredExports, rootPackId),
      controlPlaneReferences: this.controlPlaneAdapter.toControlPlaneReferences(composition.requiredControlPlaneSurfaces, rootPackId),
      warnings,
      errors,
    };
  }
}

export function createJurisdictionPackRuntime(registry: JurisdictionPackRegistry, capabilities: readonly FoundationRuntimeIntegrationStatus[]): JurisdictionPackRuntime {
  return new JurisdictionPackRuntime(registry, capabilities);
}
