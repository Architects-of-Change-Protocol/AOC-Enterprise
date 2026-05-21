import { RUNTIME_PERSISTENCE_SERIALIZATION_VERSION, RUNTIME_PERSISTENCE_SNAPSHOT_VERSION, type RuntimePersistenceEnvelope, type RuntimePersistenceValidationReport } from './runtime-persistence-types.js';
export function validateRuntimePersistenceEnvelope(envelope: unknown): RuntimePersistenceValidationReport {
  const errors: string[] = []; const warnings: string[] = []; const e = envelope as RuntimePersistenceEnvelope;
  if (!e || typeof e !== 'object') errors.push('envelope_not_object');
  if (e?.envelopeType !== 'aoc.runtime.persistence.envelope') errors.push('envelope_type_invalid');
  if (e?.envelopeVersion !== 1) errors.push('envelope_version_incompatible');
  if (e?.metadata?.snapshotVersion !== RUNTIME_PERSISTENCE_SNAPSHOT_VERSION) errors.push('snapshot_version_incompatible');
  if (e?.serializationVersion !== RUNTIME_PERSISTENCE_SERIALIZATION_VERSION) errors.push('serialization_version_incompatible');
  if (e?.metadata?.serializationVersion !== RUNTIME_PERSISTENCE_SERIALIZATION_VERSION) errors.push('metadata_serialization_version_incompatible');
  if (!e?.continuity?.runtimeSessionId || !e?.continuity?.orchestrationSessionId) errors.push('continuity_missing_ids');
  if ((e?.snapshot?.replayLineage?.deniedNonceCount ?? -1) !== (e?.snapshot?.deniedNonces?.length ?? -2)) errors.push('replay_lineage_mismatch');
  const lifecycle = e?.snapshot?.lifecycleMarkers ?? []; for (let i = 1; i < lifecycle.length; i += 1) { const current = lifecycle[i]; const prev = lifecycle[i - 1]; if (!current || !prev) continue; if (current.sequence <= prev.sequence) errors.push('lifecycle_order_invalid'); }
  if ((e?.continuity?.operationalSequenceNumber ?? -1) < lifecycle.length - 1) errors.push('operational_sequence_non_monotonic');
  if (Number.isNaN(Date.parse(e?.persistenceTimestamp ?? ''))) errors.push('persistence_timestamp_invalid');
  else if (e?.snapshot?.operational?.metadata?.createdAt && Date.parse(e.persistenceTimestamp) < Date.parse(e.snapshot.operational.metadata.createdAt)) warnings.push('persistence_timestamp_before_runtime_creation');
  return { valid: errors.length === 0, errors, warnings };
}
