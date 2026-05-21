import { createRuntimeVaultAttestation } from './runtime-vault-attestation.js';
import type { RuntimeVaultBoundary, RuntimeVaultManager } from './runtime-vault-types.js';
import { RUNTIME_VAULT_BOUNDARY_VERSION } from './runtime-vault-types.js';
import { validateRuntimeVaultBoundary } from './runtime-vault-validation.js';

function stableVaultId(input: { tenantId: string; workspaceId: string; runtimeId: string; continuityLineageId: string }): string {
  return `vault:${input.tenantId}:${input.workspaceId}:${input.runtimeId}:${input.continuityLineageId}`;
}

export function createRuntimeVaultManager(): RuntimeVaultManager {
  return {
    createVaultBoundary(input) {
      const now = input.now ?? new Date().toISOString();
      const continuityLineageId = `${input.envelope.continuity.runtimeSessionId}:${input.envelope.continuity.orchestrationSessionId}`;
      const base: Omit<RuntimeVaultBoundary, 'attestation'> = {
        boundaryType: 'aoc.runtime.vault.boundary',
        identity: {
          vaultId: stableVaultId({ tenantId: input.tenantId, workspaceId: input.workspaceId, runtimeId: input.envelope.metadata.runtimeId, continuityLineageId }),
          vaultOwnerId: input.vaultOwnerId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          trustDomain: input.envelope.metadata.trustDomain,
          runtimeId: input.envelope.metadata.runtimeId,
          continuityLineageId,
          sovereignScope: input.sovereignScope ?? 'enterprise',
          federationCompatibilityVersion: input.federationCompatibilityVersion ?? '0.1.0',
        },
        metadata: {
          boundaryVersion: RUNTIME_VAULT_BOUNDARY_VERSION,
          createdAt: now,
          updatedAt: now,
          portability: { byosCompatible: true as const, storageAgnostic: true as const, supportsSovereignExport: true as const, supportsSovereignImport: true as const },
        },
        continuity: {
          continuityEpoch: input.envelope.continuity.continuityEpoch,
          continuityVersion: input.envelope.continuity.continuityVersion,
          operationalSequenceNumber: input.envelope.continuity.operationalSequenceNumber,
          replayLineageId: input.envelope.replay.lineageId,
          restorationLineageId: input.envelope.restoration.restorationLineageId,
        },
        envelope: input.envelope,
      };
      return { ...base, attestation: createRuntimeVaultAttestation(base, now) };
    },
    validateVaultBoundary: validateRuntimeVaultBoundary,
    hydrateVaultBoundary(boundary, context) {
      const continuity = context.requireMonotonicContinuity && context.minimumContinuityVersion !== undefined
        ? { minimumOperationalSequenceNumber: context.minimumContinuityVersion }
        : {};
      const report = validateRuntimeVaultBoundary(boundary, context, continuity);
      if (!report.valid) throw new Error(`invalid_runtime_vault_boundary:${report.errors.join(',')}`);
      return boundary.envelope;
    },
    exportVaultBoundary(boundary) { return JSON.stringify(boundary); },
    importVaultBoundary(serializedBoundary) { return JSON.parse(serializedBoundary) as RuntimeVaultBoundary; },
    attestVaultBoundary(boundary, now) {
      const { attestation: _attestation, ...base } = boundary;
      return createRuntimeVaultAttestation(base, now);
    },
  };
}
