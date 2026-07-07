import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { AgentVisaService } from '../services/agent-visa-service.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeRevocationService } from '../services/handshake-revocation-service.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { IngressGrantService } from '../services/ingress-grant-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const agent: ExternalAgentDescriptor = { id: 'agent-1', type: 'agent', status: 'known', displayName: 'Agent One', firstSeenAt: NOW };
const passport: ExternalPassportPresentation = {
  id: 'passport-1',
  externalAgentId: 'agent-1',
  claimedPassportId: 'claimed-passport-1',
  status: 'valid',
  presentedAt: NOW,
  presentationHash: 'hash-1',
};

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  const ledger = new HandshakeLedger(ctx, store);
  const agentVisaService = new AgentVisaService(ctx, store, ledger);
  const ingressGrantService = new IngressGrantService(ctx, store, ledger);
  const service = new HandshakeRevocationService(ctx, store, ledger, agentVisaService, ingressGrantService);

  store.putHandshakeRequest({
    id: 'req-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: agent,
    passportPresentation: passport,
    requestedCapabilities: [],
    requestedActions: [],
    requestedResourceScopes: [],
    status: 'accepted',
    createdAt: NOW,
  });

  const visa = agentVisaService.issueAgentVisa({
    handshakeRequestId: 'req-1',
    handshakeDecisionId: 'decision-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'agent-1',
    allowedCapabilities: ['read_project_summary'],
    allowedActions: ['read_project_summary'],
    allowedResourceScopes: ['project:HMP-14665'],
  });

  const grant = ingressGrantService.issueIngressGrant(
    {
      agentVisaId: visa.id,
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      actions: ['read_project_summary'],
      resourceScopes: ['project:HMP-14665'],
      capabilities: ['read_project_summary'],
    },
    visa,
  );

  return { service, store, ledger, agentVisaService, ingressGrantService, visa, grant };
}

describe('HandshakeRevocationService', () => {
  it('1. revokes handshake request', () => {
    const { service } = setUp();
    const revoked = service.revokeHandshakeRequest('req-1', 'actor-admin', 'Compliance hold.');
    assert.equal(revoked.status, 'revoked');
  });

  it('2. revokes visa', () => {
    const { service, visa } = setUp();
    const revoked = service.revokeAgentVisa(visa.id, 'actor-admin', 'Compliance hold.');
    assert.equal(revoked.status, 'revoked');
  });

  it('3. revokes ingress grant', () => {
    const { service, grant } = setUp();
    const revoked = service.revokeIngressGrant(grant.id, 'actor-admin', 'Compliance hold.');
    assert.equal(revoked.status, 'revoked');
  });

  it('4. revoked visa cannot verify', () => {
    const { service, agentVisaService, visa } = setUp();
    service.revokeAgentVisa(visa.id, 'actor-admin', 'Compliance hold.');
    const verification = agentVisaService.verifyAgentVisa(visa.id, NOW);
    assert.equal(verification.valid, false);
  });

  it('5. revoked ingress grant cannot verify', () => {
    const { service, ingressGrantService, grant } = setUp();
    service.revokeIngressGrant(grant.id, 'actor-admin', 'Compliance hold.');
    const verification = ingressGrantService.verifyIngressGrant(grant.id, NOW, { action: 'read_project_summary', resourceScope: 'project:HMP-14665' });
    assert.equal(verification.valid, false);
  });

  it('6. historical events remain in ledger', () => {
    const { service, ledger, visa } = setUp();
    const before = ledger.getTrailByVisaId(visa.id).length;
    service.revokeAgentVisa(visa.id, 'actor-admin', 'Compliance hold.');
    const after = ledger.getTrailByVisaId(visa.id);
    assert.ok(after.length > before);
    assert.ok(after.some((event) => event.type === 'agent_visa_issued'));
  });

  it('7. records revocation events', () => {
    const { service, ledger } = setUp();
    service.revokeHandshakeRequest('req-1', 'actor-admin', 'Compliance hold.');
    const events = ledger.getTrailByRequestId('req-1');
    assert.ok(events.some((event) => event.type === 'handshake_revoked'));
  });
});
