import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext, createManualHandshakeClock, createSequentialHandshakeIdGenerator } from '../runtime/handshake-runtime-context.js';
import { AgentVisaService } from '../services/agent-visa-service.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const clock = createManualHandshakeClock(NOW);
  const ctx = { clock, ids: createSequentialHandshakeIdGenerator() };
  const store = new HandshakeStore();
  const ledger = new HandshakeLedger(ctx, store);
  return { service: new AgentVisaService(ctx, store, ledger), ledger, clock };
}

function baseInput() {
  return {
    handshakeRequestId: 'req-1',
    handshakeDecisionId: 'decision-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'agent-1',
    allowedCapabilities: ['read_project_summary'],
    allowedActions: ['read_project_summary'],
    allowedResourceScopes: ['project:HMP-14665'],
  };
}

describe('AgentVisaService', () => {
  it('1. can issue AgentVisa', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    assert.equal(visa.status, 'active');
  });

  it('2. can retrieve AgentVisa', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    assert.deepEqual(service.getAgentVisa(visa.id), visa);
  });

  it('3. can verify active visa', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    const verification = service.verifyAgentVisa(visa.id, NOW);
    assert.equal(verification.valid, true);
  });

  it('4. expired visa fails verification', () => {
    const { service, clock } = setUp();
    const visa = service.issueAgentVisa({ ...baseInput(), ttlMinutes: 1 });
    clock.advance(2 * 60_000);
    const verification = service.verifyAgentVisa(visa.id, clock.now());
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'VISA_EXPIRED');
  });

  it('5. revoked visa fails verification', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    service.revokeAgentVisa(visa.id, 'actor-admin', 'Compliance hold.');
    const verification = service.verifyAgentVisa(visa.id, NOW);
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'VISA_REVOKED');
  });

  it('6. suspended visa fails verification', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    service.suspendAgentVisa(visa.id);
    const verification = service.verifyAgentVisa(visa.id, NOW);
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'VISA_SUSPENDED');
  });

  it('7. visa cannot exceed trust boundary', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    assert.deepEqual(visa.allowedResourceScopes, ['project:HMP-14665']);
    assert.equal(visa.allowedResourceScopes.includes('project:GCH-15992'), false);
  });

  it('8. visa cannot exceed decision allowed capabilities/scopes', () => {
    const { service } = setUp();
    const visa = service.issueAgentVisa({ ...baseInput(), allowedCapabilities: ['read_project_summary'] });
    assert.deepEqual(visa.allowedCapabilities, ['read_project_summary']);
  });

  it('9. revoking visa records event', () => {
    const { service, ledger } = setUp();
    const visa = service.issueAgentVisa(baseInput());
    service.revokeAgentVisa(visa.id, 'actor-admin', 'Compliance hold.');
    const events = ledger.getTrailByVisaId(visa.id);
    assert.ok(events.some((event) => event.type === 'agent_visa_revoked'));
  });
});
