import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import { createDefaultHandshakePolicyChain } from '../policies/index.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { AgentVisaService } from '../services/agent-visa-service.js';
import { HandshakeDecisionService } from '../services/handshake-decision-service.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeProofService } from '../services/handshake-proof-service.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { IngressGrantService } from '../services/ingress-grant-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const CAPABILITY = 'read_project_summary';
const SCOPE = 'project:HMP-14665';

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
  const proofService = new HandshakeProofService(ctx, store);
  const service = new HandshakeDecisionService(ctx, store, ledger, createDefaultHandshakePolicyChain(), agentVisaService, ingressGrantService, proofService);

  store.putHandshakeRequest({
    id: 'req-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: agent,
    passportPresentation: passport,
    requestedCapabilities: [
      { id: 'cap-1', externalAgentId: 'agent-1', handshakeRequestId: 'req-1', capability: CAPABILITY, actions: [CAPABILITY], resourceScopes: [SCOPE], requestedAt: NOW, status: 'requested', riskLevel: 'low' },
    ],
    requestedActions: [CAPABILITY],
    requestedResourceScopes: [SCOPE],
    status: 'submitted',
    createdAt: NOW,
  });

  return { service, store, ledger };
}

describe('HandshakeDecisionService', () => {
  it('1. can accept valid handshake', () => {
    const { service } = setUp();
    const result = service.accept('req-1', 'ACCEPTED', 'Fully trusted.');
    assert.equal(result.decision.type, 'accepted');
    assert.equal(result.request.status, 'accepted');
  });

  it('2. can accept valid handshake with limited scope', () => {
    const { service } = setUp();
    const result = service.acceptLimited('req-1', { capabilities: [CAPABILITY], actions: [CAPABILITY], resourceScopes: [SCOPE] }, 'ACCEPTED_LIMITED', 'Narrowed.');
    assert.equal(result.decision.type, 'accepted_limited');
    assert.equal(result.request.status, 'accepted_limited');
  });

  it('3. can require approval', () => {
    const { service } = setUp();
    const result = service.requireApproval('req-1', 'RISK_REQUIRES_APPROVAL', 'High risk.');
    assert.equal(result.decision.type, 'requires_approval');
    assert.equal(result.decision.requiresApproval, true);
  });

  it('4. can reject invalid handshake', () => {
    const { service } = setUp();
    const result = service.reject('req-1', 'ISSUER_UNTRUSTED', 'Issuer not accepted.');
    assert.equal(result.decision.type, 'rejected');
    assert.equal(result.decision.accepted, false);
  });

  it('5. can quarantine unknown risky handshake', () => {
    const { service } = setUp();
    const result = service.quarantine('req-1', 'EXTERNAL_AGENT_QUARANTINED', 'Quarantined pending review.');
    assert.equal(result.decision.type, 'quarantined');
  });

  it('6. acceptance creates AgentVisa', () => {
    const { service } = setUp();
    const result = service.accept('req-1', 'ACCEPTED', 'Fully trusted.');
    assert.ok(result.visa);
    assert.equal(result.visa?.status, 'active');
  });

  it('7. acceptance creates IngressGrant', () => {
    const { service } = setUp();
    const result = service.accept('req-1', 'ACCEPTED', 'Fully trusted.');
    assert.ok(result.ingressGrant);
    assert.equal(result.ingressGrant?.status, 'active');
  });

  it('8. acceptance creates HandshakeProof', () => {
    const { service } = setUp();
    const result = service.accept('req-1', 'ACCEPTED', 'Fully trusted.');
    assert.ok(result.proof);
    assert.equal(result.proof?.accepted, true);
  });

  it('9. rejection does not create visa', () => {
    const { service } = setUp();
    const result = service.reject('req-1', 'ISSUER_UNTRUSTED', 'Issuer not accepted.');
    assert.equal(result.visa, undefined);
    assert.equal(result.ingressGrant, undefined);
  });

  it('10. approval-required decision does not create visa until approval is valid', () => {
    const { service } = setUp();
    const pending = service.requireApproval('req-1', 'RISK_REQUIRES_APPROVAL', 'High risk.');
    assert.equal(pending.visa, undefined);
    assert.equal(pending.proof, undefined);

    const accepted = service.accept('req-1', 'APPROVAL_VALID', 'Approved by Victor.');
    assert.ok(accepted.visa);
  });

  it('11. decision records correct event', () => {
    const { service, ledger } = setUp();
    service.accept('req-1', 'ACCEPTED', 'Fully trusted.');
    const events = ledger.getTrailByRequestId('req-1');
    assert.ok(events.some((event) => event.type === 'handshake_accepted'));
    assert.ok(events.some((event) => event.type === 'handshake_proof_created'));
  });
});
