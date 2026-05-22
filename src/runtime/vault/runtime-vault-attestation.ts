import type { RuntimeVaultAttestation, RuntimeVaultBoundary } from './runtime-vault-types.js';
import { RUNTIME_VAULT_ATTESTATION_VERSION } from './runtime-vault-types.js';
function fp(parts: Array<string | number | undefined>): string { return parts.join(':'); }
export function createRuntimeVaultAttestation(boundary: Omit<RuntimeVaultBoundary, 'attestation'>, now = new Date().toISOString()): RuntimeVaultAttestation {
  return {
    attestedAt: now,
    attestationVersion: RUNTIME_VAULT_ATTESTATION_VERSION,
    continuityFingerprint: fp([boundary.identity.continuityLineageId, boundary.continuity.continuityEpoch, boundary.continuity.continuityVersion]),
    replayLineageFingerprint: fp([boundary.continuity.replayLineageId, boundary.envelope.replay.deniedNonces.length]),
    lifecycleIntegrityFingerprint: fp([boundary.envelope.integrity.lifecycleCount, boundary.envelope.integrity.checksumHint]),
    restorationFingerprint: fp([boundary.continuity.restorationLineageId, boundary.envelope.restoration.restoredFromEpoch]),
  };
}
