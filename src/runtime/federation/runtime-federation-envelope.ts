import type { RuntimePersistenceEnvelope } from '../persistence';
import type { RuntimeOperationalSnapshot } from '../state';
import { createRuntimeFederationAttestation } from './runtime-federation-attestation';
import { createRuntimeFederationLineage } from './runtime-federation-lineage';
import { RUNTIME_FEDERATION_COMPATIBILITY_VERSION, type RuntimeFederationEnvelope, type RuntimeFederationIdentity } from './runtime-federation-types';

export function createRuntimeFederationEnvelope(input: { snapshot: RuntimeOperationalSnapshot; persistence: RuntimePersistenceEnvelope; identity: Omit<RuntimeFederationIdentity, 'continuityLineageId' | 'restorationLineageId' | 'federationCompatibilityVersion'>; now: string; }): RuntimeFederationEnvelope {
  const lineage = createRuntimeFederationLineage(input.snapshot);
  const federationMetadata = {
    ...input.identity,
    continuityLineageId: lineage.lineageId,
    restorationLineageId: lineage.restorationAncestry[0],
    federationCompatibilityVersion: RUNTIME_FEDERATION_COMPATIBILITY_VERSION,
  };
  const base = {
    envelopeType: 'aoc.runtime.federation.envelope' as const,
    envelopeVersion: 1 as const,
    createdAt: input.now,
    federationMetadata,
    continuity: {
      operational: input.snapshot,
      persistence: input.persistence,
      continuityEpoch: input.snapshot.continuity.continuityEpoch,
      continuityVersion: input.snapshot.continuity.continuityVersion,
      operationalSequenceNumber: input.snapshot.continuity.operationalSequenceNumber,
    },
    replay: {
      deniedNonces: [...input.snapshot.replay.deniedNonces],
      deniedNonceLineageId: `${lineage.lineageId}:replay`,
      lastDeniedAt: input.snapshot.replay.lastDeniedAt,
      replayDenialCount: input.snapshot.replay.deniedNonces.length,
    },
    lineage,
  };
  return { ...base, attestation: createRuntimeFederationAttestation(base, input.now) };
}
