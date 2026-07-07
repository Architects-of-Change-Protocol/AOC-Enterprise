import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AgentVisa } from '../domain/agent-visa.js';
import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalAuthorityPresentation } from '../domain/external-authority-presentation.js';
import type { ExternalCapabilityRequest } from '../domain/external-capability-request.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import type { ExternalTrustIssuer } from '../domain/external-trust-issuer.js';
import type { HandshakeChallenge } from '../domain/handshake-challenge.js';
import type { HandshakeDecision } from '../domain/handshake-decision.js';
import type { HandshakeProof } from '../domain/handshake-proof.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { HandshakeSession } from '../domain/handshake-session.js';
import type { IngressGrant } from '../domain/ingress-grant.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import type { ExternalAgentStanding } from '../domain/external-agent-standing.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function buildAgent(overrides: Partial<ExternalAgentDescriptor> = {}): ExternalAgentDescriptor {
  return { id: 'external-agent-1', type: 'agent', status: 'known', displayName: 'Agent One', firstSeenAt: NOW, ...overrides };
}

function buildIssuer(overrides: Partial<ExternalTrustIssuer> = {}): ExternalTrustIssuer {
  return {
    id: 'external-issuer-1',
    displayName: 'Issuer One',
    status: 'trusted',
    acceptedByTrustDomainId: TRUST_DOMAIN,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [],
    allowedResourceScopes: [],
    requiresApproval: false,
    maxVisaTtlMinutes: 60,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildBoundary(overrides: Partial<TrustBoundary> = {}): TrustBoundary {
  return {
    id: 'trust-boundary-1',
    localTrustDomainId: TRUST_DOMAIN,
    status: 'active',
    allowedExternalIssuerIds: [],
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [],
    allowedResourceScopes: [],
    prohibitedCapabilities: [],
    prohibitedActions: [],
    prohibitedResourceScopes: [],
    requiresApprovalForUnknownIssuers: true,
    requiresApprovalForHighRisk: true,
    maxVisaTtlMinutes: 60,
    dataBoundaries: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildPassportPresentation(overrides: Partial<ExternalPassportPresentation> = {}): ExternalPassportPresentation {
  return {
    id: 'passport-presentation-1',
    externalAgentId: 'external-agent-1',
    claimedPassportId: 'claimed-passport-1',
    status: 'valid',
    presentedAt: NOW,
    presentationHash: 'hash-1',
    ...overrides,
  };
}

function buildAuthorityPresentation(overrides: Partial<ExternalAuthorityPresentation> = {}): ExternalAuthorityPresentation {
  return {
    id: 'authority-presentation-1',
    externalAgentId: 'external-agent-1',
    handshakeRequestId: 'handshake-request-1',
    capability: 'read_project_summary',
    actions: ['read_project_summary'],
    resourceScopes: ['project:1'],
    status: 'valid',
    presentedAt: NOW,
    ...overrides,
  };
}

function buildCapabilityRequest(overrides: Partial<ExternalCapabilityRequest> = {}): ExternalCapabilityRequest {
  return {
    id: 'capability-request-1',
    externalAgentId: 'external-agent-1',
    handshakeRequestId: 'handshake-request-1',
    capability: 'read_project_summary',
    actions: ['read_project_summary'],
    resourceScopes: ['project:1'],
    requestedAt: NOW,
    status: 'requested',
    riskLevel: 'low',
    ...overrides,
  };
}

function buildRequest(overrides: Partial<HandshakeRequest> = {}): HandshakeRequest {
  return {
    id: 'handshake-request-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: buildAgent(),
    passportPresentation: buildPassportPresentation(),
    requestedCapabilities: [buildCapabilityRequest()],
    requestedActions: ['read_project_summary'],
    requestedResourceScopes: ['project:1'],
    status: 'submitted',
    createdAt: NOW,
    ...overrides,
  };
}

function buildChallenge(overrides: Partial<HandshakeChallenge> = {}): HandshakeChallenge {
  return {
    id: 'handshake-challenge-1',
    handshakeRequestId: 'handshake-request-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'external-agent-1',
    challengeNonce: 'nonce-1',
    challengePurpose: 'prove_control',
    status: 'issued',
    issuedAt: NOW,
    ...overrides,
  };
}

function buildSession(overrides: Partial<HandshakeSession> = {}): HandshakeSession {
  return {
    id: 'handshake-session-1',
    handshakeRequestId: 'handshake-request-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'external-agent-1',
    status: 'open',
    openedAt: NOW,
    ...overrides,
  };
}

function buildDecision(overrides: Partial<HandshakeDecision> = {}): HandshakeDecision {
  return {
    id: 'handshake-decision-1',
    handshakeRequestId: 'handshake-request-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'external-agent-1',
    type: 'accepted',
    accepted: true,
    reasonCode: 'ACCEPTED',
    reason: 'Accepted.',
    allowedCapabilities: ['read_project_summary'],
    allowedActions: ['read_project_summary'],
    allowedResourceScopes: ['project:1'],
    deniedCapabilities: [],
    deniedActions: [],
    deniedResourceScopes: [],
    requiresApproval: false,
    decidedAt: NOW,
    ...overrides,
  };
}

function buildVisa(overrides: Partial<AgentVisa> = {}): AgentVisa {
  return {
    id: 'agent-visa-1',
    handshakeRequestId: 'handshake-request-1',
    handshakeDecisionId: 'handshake-decision-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'external-agent-1',
    status: 'active',
    allowedCapabilities: ['read_project_summary'],
    allowedActions: ['read_project_summary'],
    allowedResourceScopes: ['project:1'],
    issuedAt: NOW,
    ...overrides,
  };
}

function buildIngressGrant(overrides: Partial<IngressGrant> = {}): IngressGrant {
  return {
    id: 'ingress-grant-1',
    agentVisaId: 'agent-visa-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'external-agent-1',
    status: 'active',
    actions: ['read_project_summary'],
    resourceScopes: ['project:1'],
    capabilities: ['read_project_summary'],
    issuedAt: NOW,
    ...overrides,
  };
}

function buildStanding(overrides: Partial<ExternalAgentStanding> = {}): ExternalAgentStanding {
  return {
    id: 'external-agent-standing-1',
    externalAgentId: 'external-agent-1',
    localTrustDomainId: TRUST_DOMAIN,
    type: 'recognized_temporarily',
    reasonCode: 'STANDING_VALID',
    reason: 'Valid standing.',
    evaluatedAt: NOW,
    ...overrides,
  };
}

function buildProof(overrides: Partial<HandshakeProof> = {}): HandshakeProof {
  return {
    id: 'handshake-proof-1',
    handshakeRequestId: 'handshake-request-1',
    handshakeDecisionId: 'handshake-decision-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'external-agent-1',
    passportPresentationId: 'passport-presentation-1',
    decisionType: 'accepted',
    accepted: true,
    evidenceHashes: ['hash-1'],
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

describe('HandshakeStore', () => {
  it('1. can store and retrieve ExternalAgentDescriptor', () => {
    const store = new HandshakeStore();
    const agent = buildAgent();
    store.putExternalAgent(agent);
    assert.deepEqual(store.getExternalAgent(agent.id), agent);
  });

  it('2. can store and retrieve ExternalTrustIssuer', () => {
    const store = new HandshakeStore();
    const issuer = buildIssuer();
    store.putExternalIssuer(issuer);
    assert.deepEqual(store.getExternalIssuer(issuer.id), issuer);
  });

  it('3. can store and retrieve TrustBoundary', () => {
    const store = new HandshakeStore();
    const boundary = buildBoundary();
    store.putTrustBoundary(boundary);
    assert.deepEqual(store.getTrustBoundary(boundary.id), boundary);
  });

  it('4. can store and retrieve ExternalPassportPresentation', () => {
    const store = new HandshakeStore();
    const presentation = buildPassportPresentation();
    store.putPassportPresentation(presentation);
    assert.deepEqual(store.getPassportPresentation(presentation.id), presentation);
  });

  it('5. can store and retrieve ExternalAuthorityPresentation', () => {
    const store = new HandshakeStore();
    const presentation = buildAuthorityPresentation();
    store.putAuthorityPresentation(presentation);
    assert.deepEqual(store.getAuthorityPresentation(presentation.id), presentation);
  });

  it('6. can store and retrieve ExternalCapabilityRequest', () => {
    const store = new HandshakeStore();
    const request = buildCapabilityRequest();
    store.putCapabilityRequest(request);
    assert.deepEqual(store.getCapabilityRequest(request.id), request);
  });

  it('7. can store and retrieve HandshakeRequest', () => {
    const store = new HandshakeStore();
    const request = buildRequest();
    store.putHandshakeRequest(request);
    assert.deepEqual(store.getHandshakeRequest(request.id), request);
  });

  it('8. can store and retrieve HandshakeChallenge', () => {
    const store = new HandshakeStore();
    const challenge = buildChallenge();
    store.putHandshakeChallenge(challenge);
    assert.deepEqual(store.getHandshakeChallenge(challenge.id), challenge);
  });

  it('9. can store and retrieve HandshakeSession', () => {
    const store = new HandshakeStore();
    const session = buildSession();
    store.putHandshakeSession(session);
    assert.deepEqual(store.getHandshakeSession(session.id), session);
  });

  it('10. can store and retrieve HandshakeDecision', () => {
    const store = new HandshakeStore();
    const decision = buildDecision();
    store.putHandshakeDecision(decision);
    assert.deepEqual(store.getHandshakeDecision(decision.id), decision);
  });

  it('11. can store and retrieve AgentVisa', () => {
    const store = new HandshakeStore();
    const visa = buildVisa();
    store.putAgentVisa(visa);
    assert.deepEqual(store.getAgentVisa(visa.id), visa);
  });

  it('12. can store and retrieve IngressGrant', () => {
    const store = new HandshakeStore();
    const grant = buildIngressGrant();
    store.putIngressGrant(grant);
    assert.deepEqual(store.getIngressGrant(grant.id), grant);
  });

  it('13. can store and retrieve ExternalAgentStanding', () => {
    const store = new HandshakeStore();
    const standing = buildStanding();
    store.putExternalAgentStanding(standing);
    assert.deepEqual(store.getExternalAgentStanding(standing.id), standing);
  });

  it('14. can store and retrieve HandshakeProof', () => {
    const store = new HandshakeStore();
    const proof = buildProof();
    store.putHandshakeProof(proof);
    assert.deepEqual(store.getHandshakeProof(proof.id), proof);
  });

  it('15. can query handshake requests by external agent', () => {
    const store = new HandshakeStore();
    store.putHandshakeRequest(buildRequest({ id: 'req-a', externalAgent: buildAgent({ id: 'agent-a' }) }));
    store.putHandshakeRequest(buildRequest({ id: 'req-b', externalAgent: buildAgent({ id: 'agent-b' }) }));
    const results = store.queryHandshakeRequestsByExternalAgent('agent-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'req-a');
  });

  it('16. can query handshake requests by trust domain', () => {
    const store = new HandshakeStore();
    store.putHandshakeRequest(buildRequest({ id: 'req-a', localTrustDomainId: 'domain-a' }));
    store.putHandshakeRequest(buildRequest({ id: 'req-b', localTrustDomainId: 'domain-b' }));
    const results = store.queryHandshakeRequestsByTrustDomain('domain-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'req-a');
  });

  it('17. can query active visas by external agent', () => {
    const store = new HandshakeStore();
    store.putAgentVisa(buildVisa({ id: 'visa-active', status: 'active' }));
    store.putAgentVisa(buildVisa({ id: 'visa-revoked', status: 'revoked' }));
    const results = store.queryActiveVisasByExternalAgent('external-agent-1');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'visa-active');
  });

  it('18. can query ingress grants by visa', () => {
    const store = new HandshakeStore();
    store.putIngressGrant(buildIngressGrant({ id: 'grant-a', agentVisaId: 'visa-a' }));
    store.putIngressGrant(buildIngressGrant({ id: 'grant-b', agentVisaId: 'visa-b' }));
    const results = store.queryIngressGrantsByVisa('visa-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'grant-a');
  });

  it('19. can update handshake request status', () => {
    const store = new HandshakeStore();
    store.putHandshakeRequest(buildRequest());
    const updated = store.updateHandshakeRequestStatus('handshake-request-1', 'accepted');
    assert.equal(updated.status, 'accepted');
    assert.equal(store.getHandshakeRequest('handshake-request-1')?.status, 'accepted');
  });

  it('20. can update agent visa status', () => {
    const store = new HandshakeStore();
    store.putAgentVisa(buildVisa());
    const updated = store.updateAgentVisaStatus('agent-visa-1', 'revoked');
    assert.equal(updated.status, 'revoked');
    assert.equal(store.getAgentVisa('agent-visa-1')?.status, 'revoked');
  });

  it('21. can update ingress grant status', () => {
    const store = new HandshakeStore();
    store.putIngressGrant(buildIngressGrant());
    const updated = store.updateIngressGrantStatus('ingress-grant-1', 'revoked');
    assert.equal(updated.status, 'revoked');
    assert.equal(store.getIngressGrant('ingress-grant-1')?.status, 'revoked');
  });
});
