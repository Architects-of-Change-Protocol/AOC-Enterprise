import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeOperationalStateManager, validateRuntimeOperationalState, createAocEnterpriseRuntime } from '../dist/src/index.js';

const basePorts = {
  metadata: { runtimeId: 'runtime-ops-test', trustDomain: 'td' },
  signer: { async sign(p){return {signature:JSON.stringify(p), signer:{signerId:'s',keyId:'k',algorithm:'a'}};}, async verify(){return true;}, async getCurrentKeyId(){return 'k';}, async getTrustedVerificationKeys(){return [{keyId:'k',revoked:false}]}, async verifyWithKeyId(){return true;} },
  identity: { async resolveIdentity(actorId){ return { sub: actorId }; } },
  capabilityRegistry: { async hasCapability(){ return true; } },
  delegationStore: { async validateDelegation(){ return true; } },
  lifecycleDelegationStore: { async persistDelegation(){}, async getDelegation(){return undefined;}, async validateDelegation(){return {valid:true};}, async revokeDelegation(){}, async isDelegationRevoked(){return false;} },
  executionGrantStore: { async persistGrant(){}, async getGrant(){return undefined;}, async markGrantConsumed(){return {consumed:true};}, async isGrantConsumed(){return false;}, async revokeGrant(){}, async isGrantRevoked(){return false;} },
  capabilityClaimStore: { async persistClaim(){}, async getClaim(){return undefined;}, async revokeClaim(){}, async isClaimRevoked(){return false;}, async validateClaim(){return {valid:true};} },
  replayProtection: { async recordNonce(){return {recorded:true};}, async hasSeenNonce(){return false;}, async consumeNonce(){return {consumed:true};} },
  policyDecision: { async evaluatePolicy(){ return {allowed:true,reasonCodes:[]}; } },
  agentAccess: { async evaluateAgentAccess(){ return true; } },
  auditSink: { async emitAuthorizationAudit(){ return {event_id:'e', event_type:'AUTHORIZATION_EVALUATED', occurred_at:'2026-01-01T00:00:00.000Z'}; } },
  lifecycleAuditSink: { async emitLifecycleAudit(){} },
};

test('state snapshot and hydration roundtrip', () => {
  const manager = createRuntimeOperationalStateManager({ runtimeId: 'r1', trustDomain: 'td1', now: '2026-01-01T00:00:00.000Z' });
  manager.updateRuntimeOperationalState({ eventType: 'grant_issued', entityId: 'g1', occurredAt: '2026-01-01T00:00:01.000Z' });
  const snapshot = manager.snapshotRuntimeOperationalState();
  assert.equal(validateRuntimeOperationalState(snapshot).valid, true);
  const hydrated = manager.hydrateRuntimeOperationalState(snapshot);
  assert.equal(hydrated.continuity.runtimeSessionId, snapshot.continuity.runtimeSessionId);
});

test('runtime integration exposes operational state snapshot methods', async () => {
  const runtime = createAocEnterpriseRuntime(basePorts);
  await runtime.evaluate({ requestId:'r', actorId:'a', capability:{jti:'j',trust_domain:'td',exp:4102444800}, consentGrants:[], access:{action:'read',resource:{kind:'x',id:'x'},requestedScope:['x']}, tenantId:'t', orgId:'o' });
  const snapshot = runtime.snapshotOperationalState();
  assert.equal(snapshot.counters.authorizationEnforcements >= 1, true);
});
