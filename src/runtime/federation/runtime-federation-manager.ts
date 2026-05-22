import { createRuntimeFederationEnvelope } from './runtime-federation-envelope';
import { createRuntimeFederationAttestation } from './runtime-federation-attestation';
import { reconcileRuntimeFederationEnvelopes } from './runtime-federation-reconciliation';
import { validateRuntimeFederationEnvelope } from './runtime-federation-validation';
import type { RuntimeFederationEnvelope, RuntimeFederationManager, RuntimeFederationValidationReport } from './runtime-federation-types';
import type { RuntimeOperationalSnapshot } from '../state';
import type { RuntimePersistenceEnvelope } from '../persistence';

export function createRuntimeFederationManager(input: {runtimeId: string; trustDomain: string; federationNodeId: string; sovereignVaultId: string; getSnapshot: () => RuntimeOperationalSnapshot; createPersistenceCheckpoint: (now?: string) => RuntimePersistenceEnvelope;}): RuntimeFederationManager {
  let imported: RuntimeFederationEnvelope[] = [];
  const now = () => new Date().toISOString();
  return {
    exportFederationEnvelope(ts = now()) {
      const snapshot = input.getSnapshot();
      return createRuntimeFederationEnvelope({ snapshot, persistence: input.createPersistenceCheckpoint(ts), now: ts, identity: { federationRuntimeId: input.runtimeId, federationNodeId: input.federationNodeId, sovereignVaultId: input.sovereignVaultId, trustDomain: input.trustDomain, federationEpoch: snapshot.continuity.continuityEpoch, federationSequence: snapshot.continuity.operationalSequenceNumber } });
    },
    importFederationEnvelope(envelope) { const report = validateRuntimeFederationEnvelope(envelope, input.trustDomain); if (report.valid) imported.push(envelope); return report; },
    validateFederationEnvelope(envelope) { return validateRuntimeFederationEnvelope(envelope, input.trustDomain); },
    reconcileFederationState(envelope) { return reconcileRuntimeFederationEnvelopes(this.exportFederationEnvelope(), envelope); },
    attestFederationIntegrity(envelope) { const { attestation: _x, ...base } = envelope; return createRuntimeFederationAttestation(base, now()); },
  };
}

export function validateImportedFederationEnvelopes(envelopes: RuntimeFederationEnvelope[], trustDomain: string): RuntimeFederationValidationReport[] {
  return envelopes.map((e) => validateRuntimeFederationEnvelope(e, trustDomain));
}
