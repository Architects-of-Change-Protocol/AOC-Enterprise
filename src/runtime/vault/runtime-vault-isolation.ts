import type { RuntimeVaultBoundary, RuntimeVaultIsolationContext, RuntimeVaultValidationReport } from './runtime-vault-types.js';
export function validateRuntimeVaultIsolation(boundary: RuntimeVaultBoundary, context: RuntimeVaultIsolationContext): RuntimeVaultValidationReport {
  const errors: string[] = []; const warnings: string[] = [];
  if (boundary.identity.tenantId !== context.tenantId) errors.push('tenant_drift_detected');
  if (boundary.identity.workspaceId !== context.workspaceId) errors.push('workspace_drift_detected');
  if (boundary.identity.runtimeId !== context.runtimeId) errors.push('runtime_vault_mismatch');
  if (boundary.identity.trustDomain !== context.trustDomain) errors.push('trust_domain_mismatch');
  if (boundary.identity.vaultOwnerId !== context.vaultOwnerId) errors.push('vault_owner_mismatch');
  if (context.expectedContinuityLineageId && boundary.identity.continuityLineageId !== context.expectedContinuityLineageId) errors.push('continuity_lineage_mismatch');
  if (context.minimumContinuityVersion !== undefined && boundary.continuity.continuityVersion < context.minimumContinuityVersion) errors.push('stale_vault_hydration');
  if (boundary.continuity.replayLineageId !== boundary.envelope.replay.lineageId) errors.push('replay_lineage_contamination');
  if (boundary.identity.runtimeId !== boundary.envelope.metadata.runtimeId) errors.push('runtime_metadata_mismatch');
  if (boundary.identity.trustDomain !== boundary.envelope.metadata.trustDomain) errors.push('trust_domain_metadata_mismatch');
  if (boundary.continuity.restorationLineageId !== boundary.envelope.restoration.restorationLineageId) warnings.push('restoration_lineage_mismatch');
  return { valid: errors.length === 0, errors, warnings };
}
