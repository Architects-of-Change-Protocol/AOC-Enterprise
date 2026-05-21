import type { RuntimeVaultBoundary, RuntimeVaultContinuityContext, RuntimeVaultIsolationContext, RuntimeVaultValidationReport } from './runtime-vault-types.js';
import { validateRuntimeVaultIsolation } from './runtime-vault-isolation.js';
export function validateRuntimeVaultBoundary(boundary: RuntimeVaultBoundary, isolation: RuntimeVaultIsolationContext, continuity: RuntimeVaultContinuityContext = {}): RuntimeVaultValidationReport {
  const report = validateRuntimeVaultIsolation(boundary, isolation);
  const errors = [...report.errors]; const warnings = [...report.warnings];
  if (boundary.continuity.continuityEpoch !== boundary.envelope.continuity.continuityEpoch) errors.push('continuity_epoch_mismatch');
  if (boundary.continuity.continuityVersion !== boundary.envelope.continuity.continuityVersion) errors.push('continuity_version_mismatch');
  if (boundary.continuity.operationalSequenceNumber !== boundary.envelope.continuity.operationalSequenceNumber) errors.push('continuity_sequence_mismatch');
  if (boundary.envelope.snapshot.operational.lifecycle.length !== boundary.envelope.integrity.lifecycleCount) errors.push('lifecycle_integrity_mismatch');
  if (continuity.expectedContinuityEpoch !== undefined && boundary.continuity.continuityEpoch !== continuity.expectedContinuityEpoch) errors.push('invalid_continuity_hydration');
  if (continuity.expectedRuntimeSessionId && boundary.envelope.continuity.runtimeSessionId !== continuity.expectedRuntimeSessionId) errors.push('runtime_session_mismatch');
  if (continuity.minimumOperationalSequenceNumber !== undefined && boundary.continuity.operationalSequenceNumber < continuity.minimumOperationalSequenceNumber) errors.push('lifecycle_monotonicity_violation');
  return { valid: errors.length === 0, errors, warnings };
}
