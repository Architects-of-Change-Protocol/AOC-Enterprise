import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAocEnterpriseRuntime } from '../dist/src/index.js';

const calls = [];
const signer = {
  currentKeyId: 'kid-current',
  trustedKeys: new Map([['kid-current', { revoked: false }], ['kid-rotated', { revoked: false }], ['kid-revoked', { revoked: true }]]),
  async sign(payload) {
    return { signature: `sig:${this.currentKeyId}:${JSON.stringify(payload)}`, signer: { signerId: 'test-signer', keyId: this.currentKeyId, algorithm: 'mock', issuedBy: 'tests', trustAnchorVersion: 'v2' } };
  },
  async verify(payload, signature) {
    return signature.endsWith(JSON.stringify(payload));
  },
  async getCurrentKeyId() { return this.currentKeyId; },
  async getTrustedVerificationKeys() { return [...this.trustedKeys.entries()].map(([keyId, state]) => ({ keyId, revoked: state.revoked })); },
  async verifyWithKeyId(payload, signature, keyId) {
    const state = this.trustedKeys.get(keyId);
    if (!state || state.revoked) return false;
    return signature === `sig:${keyId}:${JSON.stringify(payload)}`;
  },
};

function createLifecycleStores(auditEvents = []) {
  const grants = new Map();
  const consumed = new Set();
  const revokedGrants = new Set();
  const delegations = new Map();
  const revokedDelegations = new Set();
  const nonces = new Set();
  const claims = new Map();
  const revokedClaims = new Set();
  return {
    executionGrantStore: {
      async persistGrant(grant) {
        grants.set(grant.payload.grantId, grant);
      },
      async getGrant(grantId) {
        return grants.get(grantId);
      },
      async markGrantConsumed(grantId) {
        if (consumed.has(grantId)) return { consumed: false, reasonCodes: ['grant_replayed'] };
        consumed.add(grantId);
        return { consumed: true, reasonCodes: [] };
      },
      async isGrantConsumed(grantId) {
        return consumed.has(grantId);
      },
      async revokeGrant(grantId) {
        revokedGrants.add(grantId);
      },
      async isGrantRevoked(grantId) {
        return revokedGrants.has(grantId);
      },
    },
    lifecycleDelegationStore: {
      async persistDelegation(delegation) {
        delegations.set(delegation.payload.delegationId, delegation);
      },
      async getDelegation(delegationId) {
        return delegations.get(delegationId);
      },
      async validateDelegation() {
        return { valid: true, reasonCodes: [] };
      },
      async revokeDelegation(delegationId) {
        revokedDelegations.add(delegationId);
      },
      async isDelegationRevoked(delegationId) {
        return revokedDelegations.has(delegationId);
      },
    },
    capabilityClaimStore: {
      async persistClaim(claim) { claims.set(claim.payload.claimId, claim); },
      async getClaim(claimId) { return claims.get(claimId); },
      async revokeClaim(claimId) { revokedClaims.add(claimId); },
      async isClaimRevoked(claimId) { return revokedClaims.has(claimId); },
      async validateClaim() { return { valid: true, reasonCodes: [] }; },
    },
    replayProtection: {
      async recordNonce(nonce, scope) {
        const key = `${scope}:${nonce}`;
        if (nonces.has(key)) return { recorded: false };
        nonces.add(key);
        return { recorded: true };
      },
      async hasSeenNonce(nonce, scope) {
        return nonces.has(`${scope}:${nonce}`);
      },
      async consumeNonce(nonce, scope) {
        const key = `${scope}:${nonce}`;
        if (!nonces.has(key)) return { consumed: false };
        nonces.delete(key);
        return { consumed: true };
      },
    },
    lifecycleAuditSink: {
      async emitLifecycleAudit(event) {
        auditEvents.push(event);
      },
    },
  };
}

function createPorts(auditEvents = []) {
  return {
    metadata: {
      runtimeId: 'contract-host-runtime',
      trustDomain: 'contract-domain',
      environment: 'test',
      version: 'contract',
    },
    signer,
    identity: {
      async resolveIdentity(actorId) {
        calls.push('identity.resolveIdentity');
        return { sub: actorId };
      },
    },
    capabilityRegistry: {
      async hasCapability() {
        calls.push('capabilityRegistry.hasCapability');
        return true;
      },
    },
    delegationStore: {
      async validateDelegation() {
        calls.push('delegationStore.validateDelegation');
        return true;
      },
    },
    ...createLifecycleStores(auditEvents),
    policyDecision: {
      async evaluatePolicy() {
        calls.push('policyDecision.evaluatePolicy');
        return { allowed: true, reasonCodes: [] };
      },
    },
    agentAccess: {
      async evaluateAgentAccess() {
        calls.push('agentAccess.evaluateAgentAccess');
        return true;
      },
    },
    auditSink: {
      async emitAuthorizationAudit(input) {
        calls.push('auditSink.emitAuthorizationAudit');
        return {
          event_id: 'audit-contract-1',
          event_type: 'AUTHORIZATION_EVALUATED',
          occurred_at: '2026-05-18T00:00:00.000Z',
          request_id: input.requestId,
        };
      },
    },
  };
}

const input = {
  requestId: 'request-contract-1',
  actorId: 'actor-contract-1',
  capability: { jti: 'capability-contract-1', trust_domain: 'contract-domain', exp: 4102444800 },
  consentGrants: [],
  access: { action: 'read', resource: 'record:contract', scope: ['record:read'] },
  tenantId: 'tenant-contract',
  orgId: 'org-contract',
};

test('external host composes enterprise runtime without registry bootstrap', async () => {
  calls.length = 0;
  const runtime = createAocEnterpriseRuntime(createPorts());

  const evaluation = await runtime.evaluate(input);
  const enforcement = await runtime.enforce(input);
  const grant = await runtime.issueExecutionGrant(input);
  const grantValidation = await runtime.validateExecutionGrant(grant);

  assert.equal(evaluation.allowed, true);
  assert.equal(enforcement.allowed, true);
  assert.deepEqual(evaluation.reasonCodes, []);
  assert.equal(evaluation.metadata.runtimeId, 'contract-host-runtime');
  assert.equal(evaluation.audit.event_type, 'AUTHORIZATION_EVALUATED');
  assert.equal(grantValidation.valid, true);
  assert.ok(calls.includes('policyDecision.evaluatePolicy'));
  assert.ok(calls.includes('auditSink.emitAuthorizationAudit'));

  const hostSource = readFileSync(new URL('../dist/src/runtime/host.js', import.meta.url), 'utf8');
  assert.equal(hostSource.includes('getAocAdapter('), false);
});

test('execution grant issues, validates, and consumes once with replay denial', async () => {
  const auditEvents = [];
  const runtime = createAocEnterpriseRuntime(createPorts(auditEvents));
  const grant = await runtime.issueExecutionGrant(input);
  const validation = await runtime.validateExecutionGrant(grant, { expectedScope: 'record:read' });
  const firstConsume = await runtime.consumeExecutionGrant(grant);
  const secondConsume = await runtime.consumeExecutionGrant(grant);

  assert.equal(validation.valid, true);
  assert.equal(firstConsume.valid, true);
  assert.equal(secondConsume.valid, false);
  assert.ok(secondConsume.reasonCodes.includes('grant_replayed'));
  assert.ok(auditEvents.some((event) => event.eventType === 'grant_issued'));
  assert.ok(auditEvents.some((event) => event.eventType === 'grant_consumed'));
  assert.ok(auditEvents.some((event) => event.eventType === 'grant_replayed'));
});

test('revoked grant cannot be consumed', async () => {
  const runtime = createAocEnterpriseRuntime(createPorts());
  const grant = await runtime.issueExecutionGrant(input);
  await runtime.revokeExecutionGrant({ grantId: grant.payload.grantId, reasonCode: 'operator_revoked' });
  const consumed = await runtime.consumeExecutionGrant(grant);

  assert.equal(consumed.valid, false);
  assert.ok(consumed.reasonCodes.includes('grant_revoked'));
});

test('expired grant fails validation', async () => {
  const runtime = createAocEnterpriseRuntime(createPorts());
  const grant = await runtime.issueExecutionGrant({ ...input, expiresAt: '2020-01-01T00:00:00.000Z' });
  const validation = await runtime.validateExecutionGrant(grant);

  assert.equal(validation.valid, false);
  assert.ok(validation.reasonCodes.includes('grant_expired'));
});

test('delegation can be issued and revoked, and revoked delegation denies access', async () => {
  const auditEvents = [];
  const runtime = createAocEnterpriseRuntime(createPorts(auditEvents));
  const delegation = await runtime.issueDelegatedCapability({
    delegationId: 'delegation-contract-1',
    actorId: input.actorId,
    capability: input.capability,
    orgId: input.orgId,
    constraints: { scope: 'record:read', action: 'read', resource: 'record:contract' },
  });
  const beforeRevocation = await runtime.evaluateDelegatedAccess({
    actor: { sub: input.actorId },
    delegatedCapability: delegation,
    access: input.access,
    orgId: input.orgId,
  });
  await runtime.revokeDelegatedCapability({ delegationId: delegation.payload.delegationId, reasonCode: 'operator_revoked' });
  const afterRevocation = await runtime.evaluateDelegatedAccess({
    actor: { sub: input.actorId },
    delegatedCapability: delegation,
    access: input.access,
    orgId: input.orgId,
  });

  assert.equal(beforeRevocation.allowed, true);
  assert.equal(afterRevocation.allowed, false);
  assert.ok(afterRevocation.reasonCodes.includes('delegation_revoked'));
  assert.ok(auditEvents.some((event) => event.eventType === 'delegation_issued'));
  assert.ok(auditEvents.some((event) => event.eventType === 'delegation_revoked'));
  assert.ok(auditEvents.some((event) => event.eventType === 'delegation_denied'));
});

test('capability claim validates expected actor, org, and trust domain', async () => {
  const auditEvents = [];
  const runtime = createAocEnterpriseRuntime(createPorts(auditEvents));
  const claim = await runtime.createCapabilityClaim({
    claimId: 'claim-contract-1',
    actorId: input.actorId,
    capability: input.capability,
    orgId: input.orgId,
    expiresAt: '2100-01-01T00:00:00.000Z',
  });
  const verification = await runtime.verifyCapabilityClaim(claim, {
    actorId: input.actorId,
    orgId: input.orgId,
    trustDomain: 'contract-domain',
  });

  assert.equal(claim.payload.trustDomain, 'contract-domain');
  assert.equal(verification.valid, true);
  assert.ok(auditEvents.some((event) => event.eventType === 'claim_issued'));
  assert.ok(auditEvents.some((event) => event.eventType === 'claim_verified'));
});
