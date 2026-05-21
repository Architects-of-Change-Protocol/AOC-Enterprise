import { dehydrateRuntimeOperationalState, hydrateRuntimeOperationalState, type RuntimeOperationalSnapshot } from '../state';
import type { RuntimePersistenceAdapter } from './runtime-persistence-adapter';
import { deserializeRuntimePersistenceEnvelope, serializeRuntimePersistenceEnvelope } from './runtime-persistence-serialization';
import { validateRuntimePersistenceEnvelope } from './runtime-persistence-validation';
import { RUNTIME_PERSISTENCE_SERIALIZATION_VERSION, RUNTIME_PERSISTENCE_SNAPSHOT_VERSION, type RuntimePersistenceEnvelope, type RuntimePersistenceHydrationResult } from './runtime-persistence-types';
export interface RuntimePersistenceManager {
  createPersistenceCheckpoint(snapshot: RuntimeOperationalSnapshot, now?: string): RuntimePersistenceEnvelope;
  exportPersistenceEnvelope(envelope: RuntimePersistenceEnvelope): string;
  hydratePersistenceCheckpoint(envelope: RuntimePersistenceEnvelope): RuntimePersistenceHydrationResult;
  persistSnapshot(envelope: RuntimePersistenceEnvelope): Promise<{ persisted: boolean; checkpointId: string }>;
}
export function createRuntimePersistenceManager(input: { runtimeId: string; trustDomain: string; adapter?: RuntimePersistenceAdapter }): RuntimePersistenceManager {
  function createPersistenceCheckpoint(snapshot: RuntimeOperationalSnapshot, now = new Date().toISOString()): RuntimePersistenceEnvelope {
    const operational = dehydrateRuntimeOperationalState(snapshot);
    return { envelopeType: 'aoc.runtime.persistence.envelope', envelopeVersion: 1, serializationVersion: RUNTIME_PERSISTENCE_SERIALIZATION_VERSION, persistenceTimestamp: now, continuity: operational.continuity, metadata: { runtimeId: input.runtimeId, trustDomain: input.trustDomain, persistedAt: now, persistenceEpoch: operational.continuity.continuityEpoch, snapshotVersion: RUNTIME_PERSISTENCE_SNAPSHOT_VERSION, serializationVersion: RUNTIME_PERSISTENCE_SERIALIZATION_VERSION }, integrity: { lifecycleCount: operational.lifecycle.length, checksumHint: `${operational.continuity.runtimeSessionId}:${operational.continuity.continuityVersion}` }, replay: { deniedNonces: [...operational.replay.deniedNonces], lastDeniedAt: operational.replay.lastDeniedAt, lineageId: `${operational.continuity.runtimeSessionId}:${operational.continuity.operationalSequenceNumber}` }, restoration: { restorationLineageId: `${operational.continuity.orchestrationSessionId}:${operational.continuity.continuityEpoch}`, restoredFromEpoch: operational.continuity.continuityEpoch }, checkpoint: { checkpointId: `${operational.continuity.runtimeSessionId}:${operational.continuity.continuityVersion}`, createdAt: now, continuityEpoch: operational.continuity.continuityEpoch, continuityVersion: operational.continuity.continuityVersion, operationalSequenceNumber: operational.continuity.operationalSequenceNumber }, snapshot: { operational, deniedNonces: [...operational.replay.deniedNonces], replayLineage: { lastDeniedAt: operational.replay.lastDeniedAt, deniedNonceCount: operational.replay.deniedNonces.length }, lifecycleMarkers: operational.lifecycle.map((m) => ({ sequence: m.sequence, eventType: m.eventType, occurredAt: m.occurredAt })) } };
  }
  return {
    createPersistenceCheckpoint,
    exportPersistenceEnvelope(envelope) { return serializeRuntimePersistenceEnvelope(envelope); },
    hydratePersistenceCheckpoint(envelope) { const report = validateRuntimePersistenceEnvelope(envelope); if (!report.valid) throw new Error(`invalid_runtime_persistence_envelope:${report.errors.join(',')}`); const hydratedSnapshot = hydrateRuntimeOperationalState(envelope.snapshot.operational); return { hydratedSnapshot, continuityRestored: hydratedSnapshot.continuity.runtimeSessionId === envelope.continuity.runtimeSessionId, replayContinuityPreserved: hydratedSnapshot.replay.deniedNonces.length === envelope.snapshot.deniedNonces.length }; },
    async persistSnapshot(envelope) { const report = validateRuntimePersistenceEnvelope(envelope); if (!report.valid) throw new Error(`invalid_runtime_persistence_envelope:${report.errors.join(',')}`); if (!input.adapter) return { persisted: false, checkpointId: envelope.checkpoint.checkpointId }; const adapterReport = await input.adapter.validateSnapshot(envelope); if (!adapterReport.valid) throw new Error(`adapter_rejected_runtime_persistence_envelope:${adapterReport.errors.join(',')}`); return input.adapter.persistSnapshot(envelope); },
  };
}
export { deserializeRuntimePersistenceEnvelope, serializeRuntimePersistenceEnvelope };
