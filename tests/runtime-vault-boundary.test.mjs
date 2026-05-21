import test from 'node:test';
import assert from 'node:assert/strict';
import runtimePkg from '../dist/src/index.js';
const { createRuntimeOperationalStateManager, createRuntimePersistenceManager, createRuntimeVaultManager, createAocEnterpriseRuntime } = runtimePkg;

const basePorts = { metadata: { runtimeId: 'r-v', trustDomain: 'td-v' }, signer: { async sign(p){return {signature:JSON.stringify(p), signer:{signerId:'s',keyId:'k',algorithm:'a'}};}, async verify(){return true;}, async getCurrentKeyId(){return 'k';}, async getTrustedVerificationKeys(){return [{keyId:'k',revoked:false}]}, async verifyWithKeyId(){return true;} }, identity: { async resolveIdentity(actorId){ return { sub: actorId }; } }, capabilityRegistry: { async hasCapability(){ return true; } }, delegationStore: { async validateDelegation(){ return true; } }, lifecycleDelegationStore: { async persistDelegation(){}, async getDelegation(){return undefined;}, async validateDelegation(){return {valid:true};}, async revokeDelegation(){}, async isDelegationRevoked(){return false;} }, executionGrantStore: { async persistGrant(){}, async getGrant(){return undefined;}, async markGrantConsumed(){return {consumed:true};}, async isGrantConsumed(){return false;}, async revokeGrant(){}, async isGrantRevoked(){return false;} }, capabilityClaimStore: { async persistClaim(){}, async getClaim(){return undefined;}, async revokeClaim(){}, async isClaimRevoked(){return false;}, async validateClaim(){return {valid:true};} }, replayProtection: { async recordNonce(){return {recorded:true};}, async hasSeenNonce(){return false;}, async consumeNonce(){return {consumed:true};} }, policyDecision: { async evaluatePolicy(){ return {allowed:true,reasonCodes:[]}; } }, agentAccess: { async evaluateAgentAccess(){ return true; } }, auditSink: { async emitAuthorizationAudit(){ return {event_id:'e', event_type:'AUTHORIZATION_EVALUATED', occurred_at:'2026-01-01T00:00:00.000Z'}; } }, lifecycleAuditSink: { async emitLifecycleAudit(){} } };

test('vault identity, isolation, portability, attestation', () => {
  const manager = createRuntimeOperationalStateManager({ runtimeId: 'r3', trustDomain: 'td3', now: '2026-01-01T00:00:00.000Z' });
  manager.updateRuntimeOperationalState({ eventType: 'replay_denied', nonce: 'n1', occurredAt: '2026-01-01T00:00:01.000Z' });
  const envelope = createRuntimePersistenceManager({ runtimeId: 'r3', trustDomain: 'td3' }).createPersistenceCheckpoint(manager.snapshotRuntimeOperationalState(), '2026-01-01T00:00:02.000Z');
  const vault = createRuntimeVaultManager();
  const boundary = vault.createVaultBoundary({ envelope, tenantId: 't1', workspaceId: 'w1', vaultOwnerId: 'owner1', sovereignScope: 'hybrid' });
  assert.equal(boundary.identity.vaultId.includes('t1:w1:r3'), true);
  const report = vault.validateVaultBoundary(boundary, { tenantId: 't1', workspaceId: 'w1', runtimeId: 'r3', trustDomain: 'td3', vaultOwnerId: 'owner1' });
  assert.equal(report.valid, true);
  assert.equal(vault.attestVaultBoundary(boundary).continuityFingerprint.length > 0, true);
  const roundtrip = vault.importVaultBoundary(vault.exportVaultBoundary(boundary));
  assert.equal(roundtrip.identity.vaultId, boundary.identity.vaultId);
});

test('invalid vault boundary rejected on tenant drift', () => {
  const manager = createRuntimeOperationalStateManager({ runtimeId: 'r4', trustDomain: 'td4', now: '2026-01-01T00:00:00.000Z' });
  const envelope = createRuntimePersistenceManager({ runtimeId: 'r4', trustDomain: 'td4' }).createPersistenceCheckpoint(manager.snapshotRuntimeOperationalState());
  const vault = createRuntimeVaultManager();
  const boundary = vault.createVaultBoundary({ envelope, tenantId: 't1', workspaceId: 'w1', vaultOwnerId: 'owner1' });
  const report = vault.validateVaultBoundary(boundary, { tenantId: 't2', workspaceId: 'w1', runtimeId: 'r4', trustDomain: 'td4', vaultOwnerId: 'owner1' });
  assert.equal(report.valid, false);
  assert.equal(report.errors.includes('tenant_drift_detected'), true);
});

test('runtime exposes sovereign vault hooks and preserves continuity', () => {
  const runtime = createAocEnterpriseRuntime(basePorts);
  const boundary = runtime.createVaultBoundary({ tenantId: 't1', workspaceId: 'w1', vaultOwnerId: 'owner1', now: '2026-01-01T00:00:00.000Z' });
  const hydrated = runtime.hydrateVaultBoundary(boundary, { tenantId: 't1', workspaceId: 'w1', runtimeId: 'r-v', trustDomain: 'td-v', vaultOwnerId: 'owner1' });
  assert.equal(hydrated.continuity.runtimeSessionId, boundary.envelope.continuity.runtimeSessionId);
});
