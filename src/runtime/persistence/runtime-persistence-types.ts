import type { RuntimeOperationalSnapshot } from '../state';
export const RUNTIME_PERSISTENCE_SNAPSHOT_VERSION = 1 as const;
export const RUNTIME_PERSISTENCE_SERIALIZATION_VERSION = 1 as const;
export interface RuntimePersistenceMetadata { runtimeId: string; trustDomain: string; persistedAt: string; persistenceEpoch: number; snapshotVersion: number; serializationVersion: number; }
export interface RuntimePersistenceCheckpoint { checkpointId: string; createdAt: string; continuityEpoch: number; continuityVersion: number; operationalSequenceNumber: number; }
export interface RuntimePersistenceSnapshot { operational: RuntimeOperationalSnapshot; deniedNonces: string[]; replayLineage: { lastDeniedAt?: string; deniedNonceCount: number }; lifecycleMarkers: Array<{ sequence: number; eventType: string; occurredAt: string }>; }
export interface RuntimePersistenceEnvelope { envelopeType: 'aoc.runtime.persistence.envelope'; envelopeVersion: 1; serializationVersion: number; persistenceTimestamp: string; continuity: RuntimeOperationalSnapshot['continuity']; metadata: RuntimePersistenceMetadata; integrity: { lifecycleCount: number; checksumHint: string }; replay: { deniedNonces: string[]; lastDeniedAt?: string; lineageId: string }; restoration: { restorationLineageId: string; restoredFromEpoch: number }; checkpoint: RuntimePersistenceCheckpoint; snapshot: RuntimePersistenceSnapshot; }
export interface RuntimePersistenceHydrationResult { hydratedSnapshot: RuntimeOperationalSnapshot; continuityRestored: boolean; replayContinuityPreserved: boolean; }
export interface RuntimePersistenceValidationReport { valid: boolean; errors: string[]; warnings: string[]; }
