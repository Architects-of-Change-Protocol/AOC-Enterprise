import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  return { ledger: new HandshakeLedger(ctx, store), store };
}

describe('HandshakeLedger', () => {
  it('1. records handshake_submitted event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_submitted');
  });

  it('2. records challenge issued event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_challenge_issued', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_challenge_issued');
  });

  it('3. records accepted event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_accepted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_accepted');
  });

  it('4. records accepted_limited event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_accepted_limited', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_accepted_limited');
  });

  it('5. records requires_approval event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_requires_approval', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_requires_approval');
  });

  it('6. records rejected event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_rejected', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_rejected');
  });

  it('7. records quarantined event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_quarantined', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(event.type, 'handshake_quarantined');
  });

  it('8. records visa issued event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'agent_visa_issued', localTrustDomainId: TRUST_DOMAIN, visaId: 'visa-1', payload: {} });
    assert.equal(event.type, 'agent_visa_issued');
  });

  it('9. records visa revoked event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'agent_visa_revoked', localTrustDomainId: TRUST_DOMAIN, visaId: 'visa-1', payload: {} });
    assert.equal(event.type, 'agent_visa_revoked');
  });

  it('10. records ingress grant issued event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'ingress_grant_issued', localTrustDomainId: TRUST_DOMAIN, visaId: 'visa-1', ingressGrantId: 'grant-1', payload: {} });
    assert.equal(event.type, 'ingress_grant_issued');
  });

  it('11. records ingress grant revoked event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'ingress_grant_revoked', localTrustDomainId: TRUST_DOMAIN, visaId: 'visa-1', ingressGrantId: 'grant-1', payload: {} });
    assert.equal(event.type, 'ingress_grant_revoked');
  });

  it('12. records proof created event', () => {
    const { ledger } = setUp();
    const event = ledger.recordEvent({ type: 'handshake_proof_created', localTrustDomainId: TRUST_DOMAIN, handshakeProofId: 'proof-1', payload: {} });
    assert.equal(event.type, 'handshake_proof_created');
  });

  it('13. event hash is deterministic', () => {
    const { ledger: ledgerA } = setUp();
    const { ledger: ledgerB } = setUp();
    const eventA = ledgerA.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: { foo: 'bar' } });
    const eventB = ledgerB.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: { foo: 'bar' } });
    assert.equal(eventA.eventHash, eventB.eventHash);
  });

  it('14. ledger maintains previousHash/eventHash chain', () => {
    const { ledger } = setUp();
    const first = ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    const second = ledger.recordEvent({ type: 'handshake_accepted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-1', payload: {} });
    assert.equal(second.previousHash, first.eventHash);
  });

  it('15. can retrieve trail by handshakeRequestId', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-a', payload: {} });
    ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, handshakeRequestId: 'req-b', payload: {} });
    const trail = ledger.getTrailByRequestId('req-a');
    assert.equal(trail.length, 1);
  });

  it('16. can retrieve trail by externalAgentId', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-a', payload: {} });
    ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent-b', payload: {} });
    const trail = ledger.getTrailByExternalAgentId('agent-a');
    assert.equal(trail.length, 1);
  });

  it('17. can retrieve trail by visaId', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'agent_visa_issued', localTrustDomainId: TRUST_DOMAIN, visaId: 'visa-a', payload: {} });
    ledger.recordEvent({ type: 'agent_visa_issued', localTrustDomainId: TRUST_DOMAIN, visaId: 'visa-b', payload: {} });
    const trail = ledger.getTrailByVisaId('visa-a');
    assert.equal(trail.length, 1);
  });

  it('18. can retrieve events by trustDomainId', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: 'domain-a', payload: {} });
    ledger.recordEvent({ type: 'handshake_submitted', localTrustDomainId: 'domain-b', payload: {} });
    const trail = ledger.getEventTrail({ localTrustDomainId: 'domain-a' });
    assert.equal(trail.length, 1);
  });
});
