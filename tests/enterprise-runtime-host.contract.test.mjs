import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAocEnterpriseRuntime } from '../dist/src/index.js';

const calls = [];
const signer = {
  async sign(payload) {
    return `sig:${JSON.stringify(payload)}`;
  },
  async verify(payload, signature) {
    return signature === `sig:${JSON.stringify(payload)}`;
  },
};

function createPorts() {
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
