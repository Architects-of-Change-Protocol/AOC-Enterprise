import runtimePkg from '../dist/src/index.js';
const { createRuntimeOperationalStateManager, createRuntimePersistenceManager, createRuntimeFederationEnvelope, validateRuntimeFederationEnvelope, reconcileRuntimeFederationEnvelopes } = runtimePkg;
const m = createRuntimeOperationalStateManager({ runtimeId: 'check-fed', trustDomain: 'check-domain', now: '2026-01-01T00:00:00.000Z' });
m.updateRuntimeOperationalState({ eventType: 'replay_denied', nonce: 'denied-1', occurredAt: '2026-01-01T00:00:01.000Z' });
const snap = m.snapshotRuntimeOperationalState();
const p = createRuntimePersistenceManager({ runtimeId: 'check-fed', trustDomain: 'check-domain' });
const persistence = p.createPersistenceCheckpoint(snap, '2026-01-01T00:00:02.000Z');
const env = createRuntimeFederationEnvelope({ snapshot: snap, persistence, now: '2026-01-01T00:00:02.000Z', identity: { federationRuntimeId: 'check-fed', federationNodeId: 'node-1', sovereignVaultId: 'vault-1', trustDomain: 'check-domain', federationEpoch: 1, federationSequence: 1 } });
const valid = validateRuntimeFederationEnvelope(env, 'check-domain');
if (!valid.valid) throw new Error(`validation_failed:${valid.errors.join(',')}`);
// The foreign envelope must stay internally consistent: validation requires
// federationMetadata.continuityLineageId === lineage.lineageId, so a remote
// lineage rename must update both (the previous version renamed only
// lineage.lineageId, which the validator correctly rejects).
const remoteLineageId = `${env.lineage.lineageId}:remote`;
const rec = reconcileRuntimeFederationEnvelopes(env, {
  ...env,
  federationMetadata: { ...env.federationMetadata, federationSequence: 2, continuityLineageId: remoteLineageId },
  lineage: { ...env.lineage, lineageId: remoteLineageId, federationAncestry: [...env.lineage.federationAncestry, 'remote'] },
});
if (!['accepted','partially_merged'].includes(rec.status)) throw new Error(`reconciliation_failed:${rec.status}`);
if (!env.attestation.federationIntegrityFingerprint) throw new Error('attestation_missing');
console.log('runtime federation check passed');
