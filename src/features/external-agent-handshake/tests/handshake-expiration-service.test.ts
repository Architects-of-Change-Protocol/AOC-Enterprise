import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import { createManualHandshakeClock, createSequentialHandshakeIdGenerator } from '../runtime/handshake-runtime-context.js';
import { AgentVisaService } from '../services/agent-visa-service.js';
import { HandshakeExpirationService } from '../services/handshake-expiration-service.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
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
  const clock = createManualHandshakeClock(NOW);
  const ctx = { clock, ids: createSequentialHandshakeIdGenerator() };
  const store = new HandshakeStore();
  const ledger = new HandshakeLedger(ctx, store);
  const agentVisaService = new AgentVisaService(ctx, store, ledger);
  const ingressGrantService = new IngressGrantService(ctx, store, ledger);
  const service = new HandshakeExpirationService(ctx, store, agentVisaService, ingressGrantService);
  return { service, store, agentVisaService, ingressGrantService, clock };
}

describe('HandshakeExpirationService', () => {
  it('1. detects expired handshake request', () => {
    const { service, store, clock } = setUp();
    store.putHandshakeRequest({
      id: 'req-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgent: agent,
      passportPresentation: passport,
      requestedCapabilities: [],
      requestedActions: [],
      requestedResourceScopes: [],
      status: 'submitted',
      createdAt: NOW,
      expiresAt: new Date(Date.parse(NOW) + 60_000).toISOString(),
    });
    clock.advance(2 * 60_000);
    assert.equal(service.isRequestExpired(store.getHandshakeRequest('req-1')!, clock.now()), true);
  });

  it('2. detects expired challenge', () => {
    const { service, store, clock } = setUp();
    store.putHandshakeChallenge({
      id: 'challenge-1',
      handshakeRequestId: 'req-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      challengeNonce: 'nonce-1',
      challengePurpose: 'prove_control',
      status: 'issued',
      issuedAt: NOW,
      expiresAt: new Date(Date.parse(NOW) + 60_000).toISOString(),
    });
    clock.advance(2 * 60_000);
    assert.equal(service.isChallengeExpired(store.getHandshakeChallenge('challenge-1')!, clock.now()), true);
  });

  it('3. detects expired session', () => {
    const { service, store, clock } = setUp();
    store.putHandshakeSession({
      id: 'session-1',
      handshakeRequestId: 'req-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      status: 'open',
      openedAt: NOW,
      expiresAt: new Date(Date.parse(NOW) + 60_000).toISOString(),
    });
    clock.advance(2 * 60_000);
    const expired = service.expireHandshakeSessionIfNeeded('session-1');
    assert.equal(expired?.status, 'expired');
  });

  it('4. detects expired visa', () => {
    const { service, agentVisaService, clock } = setUp();
    const visa = agentVisaService.issueAgentVisa({
      handshakeRequestId: 'req-1',
      handshakeDecisionId: 'decision-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      allowedCapabilities: [],
      allowedActions: [],
      allowedResourceScopes: [],
      ttlMinutes: 1,
    });
    clock.advance(2 * 60_000);
    assert.equal(service.isVisaExpired(visa, clock.now()), true);
  });

  it('5. detects expired ingress grant', () => {
    const { service, agentVisaService, ingressGrantService, clock } = setUp();
    const visa = agentVisaService.issueAgentVisa({
      handshakeRequestId: 'req-1',
      handshakeDecisionId: 'decision-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      allowedCapabilities: [],
      allowedActions: [],
      allowedResourceScopes: [],
    });
    const grant = ingressGrantService.issueIngressGrant(
      {
        agentVisaId: visa.id,
        localTrustDomainId: TRUST_DOMAIN,
        externalAgentId: 'agent-1',
        actions: [],
        resourceScopes: [],
        capabilities: [],
        expiresAt: new Date(Date.parse(NOW) + 60_000).toISOString(),
      },
      visa,
    );
    clock.advance(2 * 60_000);
    assert.equal(service.isIngressGrantExpired(grant, clock.now()), true);
  });

  it('6. marks expired visa', () => {
    const { service, agentVisaService, clock } = setUp();
    const visa = agentVisaService.issueAgentVisa({
      handshakeRequestId: 'req-1',
      handshakeDecisionId: 'decision-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      allowedCapabilities: [],
      allowedActions: [],
      allowedResourceScopes: [],
      ttlMinutes: 1,
    });
    clock.advance(2 * 60_000);
    const expired = service.expireAgentVisaIfNeeded(visa.id);
    assert.equal(expired?.status, 'expired');
  });

  it('7. expired visa cannot verify', () => {
    const { service, agentVisaService, clock } = setUp();
    const visa = agentVisaService.issueAgentVisa({
      handshakeRequestId: 'req-1',
      handshakeDecisionId: 'decision-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      allowedCapabilities: [],
      allowedActions: [],
      allowedResourceScopes: [],
      ttlMinutes: 1,
    });
    clock.advance(2 * 60_000);
    service.expireAgentVisaIfNeeded(visa.id);
    const verification = agentVisaService.verifyAgentVisa(visa.id, clock.now());
    assert.equal(verification.valid, false);
  });

  it('8. uses injected clock only', () => {
    const { service, agentVisaService, clock } = setUp();
    const visa = agentVisaService.issueAgentVisa({
      handshakeRequestId: 'req-1',
      handshakeDecisionId: 'decision-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent-1',
      allowedCapabilities: [],
      allowedActions: [],
      allowedResourceScopes: [],
      ttlMinutes: 60,
    });
    assert.equal(service.isVisaExpired(visa, clock.now()), false);
    clock.advance(61 * 60_000);
    assert.equal(service.isVisaExpired(visa, clock.now()), true);
  });
});
