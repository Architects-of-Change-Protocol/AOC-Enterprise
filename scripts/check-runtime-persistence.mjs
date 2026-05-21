import runtimePkg from '../dist/src/index.js';
const { createRuntimeOperationalStateManager, createRuntimePersistenceManager, serializeRuntimePersistenceEnvelope, deserializeRuntimePersistenceEnvelope, validateRuntimePersistenceEnvelope } = runtimePkg;
const state = createRuntimeOperationalStateManager({ runtimeId: 'check-runtime', trustDomain: 'check-domain', now: '2026-01-01T00:00:00.000Z' });
state.updateRuntimeOperationalState({ eventType: 'grant_issued', entityId: 'g-check', occurredAt: '2026-01-01T00:00:01.000Z' });
state.updateRuntimeOperationalState({ eventType: 'replay_denied', nonce: 'nonce-check', occurredAt: '2026-01-01T00:00:02.000Z' });
const persistence = createRuntimePersistenceManager({ runtimeId: 'check-runtime', trustDomain: 'check-domain' });
const envelope = persistence.createPersistenceCheckpoint(state.snapshotRuntimeOperationalState(), '2026-01-01T00:00:03.000Z');
const serialized = serializeRuntimePersistenceEnvelope(envelope);
const restoredEnvelope = deserializeRuntimePersistenceEnvelope(serialized);
const report = validateRuntimePersistenceEnvelope(restoredEnvelope);
if (!report.valid) { console.error('Runtime persistence check failed:', report.errors); process.exit(1); }
const hydrated = persistence.hydratePersistenceCheckpoint(restoredEnvelope);
if (!hydrated.continuityRestored || !hydrated.replayContinuityPreserved) { console.error('Runtime persistence continuity check failed'); process.exit(1); }
console.log('runtime persistence abstraction check passed');
