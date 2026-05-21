import test from 'node:test';
import assert from 'node:assert/strict';
import runtimePkg from '../dist/src/index.js';
const { createRuntimeOperationalStateManager, createRuntimePersistenceManager, validateRuntimePersistenceEnvelope, serializeRuntimePersistenceEnvelope, deserializeRuntimePersistenceEnvelope, createAocEnterpriseRuntime } = runtimePkg;

test('persistence envelope creation and deterministic serialization', () => {
  const manager = createRuntimeOperationalStateManager({ runtimeId: 'r1', trustDomain: 'td1', now: '2026-01-01T00:00:00.000Z' });
  manager.updateRuntimeOperationalState({ eventType: 'replay_denied', nonce: 'n-1', occurredAt: '2026-01-01T00:00:01.000Z' });
  const persistence = createRuntimePersistenceManager({ runtimeId: 'r1', trustDomain: 'td1' });
  const envelope = persistence.createPersistenceCheckpoint(manager.snapshotRuntimeOperationalState(), '2026-01-01T00:00:02.000Z');
  const a = serializeRuntimePersistenceEnvelope(envelope);
  const b = serializeRuntimePersistenceEnvelope(envelope);
  assert.equal(a, b);
  assert.equal(validateRuntimePersistenceEnvelope(envelope).valid, true);
});

test('hydration roundtrip preserves continuity and replay lineage', () => {
  const manager = createRuntimeOperationalStateManager({ runtimeId: 'r2', trustDomain: 'td2', now: '2026-01-01T00:00:00.000Z' });
  manager.updateRuntimeOperationalState({ eventType: 'grant_issued', entityId: 'g1', occurredAt: '2026-01-01T00:00:01.000Z' });
  manager.updateRuntimeOperationalState({ eventType: 'replay_denied', nonce: 'n-2', occurredAt: '2026-01-01T00:00:02.000Z' });
  const persistence = createRuntimePersistenceManager({ runtimeId: 'r2', trustDomain: 'td2' });
  const envelope = persistence.createPersistenceCheckpoint(manager.snapshotRuntimeOperationalState(), '2026-01-01T00:00:03.000Z');
  const restored = persistence.hydratePersistenceCheckpoint(deserializeRuntimePersistenceEnvelope(serializeRuntimePersistenceEnvelope(envelope)));
  assert.equal(restored.continuityRestored, true);
  assert.equal(restored.replayContinuityPreserved, true);
});

test('invalid envelope rejected', () => {
  const report = validateRuntimePersistenceEnvelope({ envelopeType: 'bad' });
  assert.equal(report.valid, false);
  assert.ok(report.errors.length > 0);
});

test('runtime exposes persistence hooks', () => {
  const runtime = createAocEnterpriseRuntime({ metadata: { runtimeId: 'rh', trustDomain: 'td' }, signer: { async sign(p){return {signature:JSON.stringify(p), signer:{signerId:'s',keyId:'k',algorithm:'a'}};}, async verify(){return true;}, async getCurrentKeyId(){return 'k';}, async getTrustedVerificationKeys(){return [{keyId:'k',revoked:false}]}, async verifyWithKeyId(){return true;} }, identity: { async resolveIdentity(actorId){ return { sub: actorId }; } }, capabilityRegistry: { async hasCapability(){ return true; } }, delegationStore: { async validateDelegation(){ return true; } }, lifecycleDelegationStore: { async persistDelegation(){}, async getDelegation(){return undefined;}, async validateDelegation(){return {valid:true};}, async revokeDelegation(){}, async isDelegationRevoked(){return false;} }, executionGrantStore: { async persistGrant(){}, async getGrant(){return undefined;}, async markGrantConsumed(){return {consumed:true};}, async isGrantConsumed(){return false;}, async revokeGrant(){}, async isGrantRevoked(){return false;} }, capabilityClaimStore: { async persistClaim(){}, async getClaim(){return undefined;}, async revokeClaim(){}, async isClaimRevoked(){return false;}, async validateClaim(){return {valid:true};} }, replayProtection: { async recordNonce(){return {recorded:true};}, async hasSeenNonce(){return false;}, async consumeNonce(){return {consumed:true};} }, policyDecision: { async evaluatePolicy(){ return {allowed:true,reasonCodes:[]}; } }, agentAccess: { async evaluateAgentAccess(){ return true; } }, auditSink: { async emitAuthorizationAudit(){ return {event_id:'e', event_type:'AUTHORIZATION_EVALUATED', occurred_at:'2026-01-01T00:00:00.000Z'}; } }, lifecycleAuditSink: { async emitLifecycleAudit(){} } });
  const envelope = runtime.createPersistenceCheckpoint('2026-01-01T00:00:00.000Z');
  assert.equal(typeof runtime.exportPersistenceEnvelope('2026-01-01T00:00:00.000Z'), 'string');
  const hydrated = runtime.hydratePersistenceCheckpoint(envelope);
  assert.equal(hydrated.continuity.runtimeSessionId, envelope.continuity.runtimeSessionId);
});
