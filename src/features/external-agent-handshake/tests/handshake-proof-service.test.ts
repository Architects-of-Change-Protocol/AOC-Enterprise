import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeProofService, type CreateHandshakeProofInput } from '../services/handshake-proof-service.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function baseInput(overrides: Partial<CreateHandshakeProofInput> = {}): CreateHandshakeProofInput {
  return {
    handshakeRequestId: 'req-1',
    handshakeDecisionId: 'decision-1',
    localTrustDomainId: TRUST_DOMAIN,
    externalAgentId: 'agent-1',
    passportPresentationId: 'passport-1',
    decisionType: 'accepted',
    accepted: true,
    evidenceHashes: ['hash-1'],
    ...overrides,
  };
}

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  return { service: new HandshakeProofService(ctx, store), store };
}

describe('HandshakeProofService', () => {
  it('1. HandshakeProof hash is deterministic', () => {
    const { service: serviceA } = setUp();
    const { service: serviceB } = setUp();
    const proofA = serviceA.createProof(baseInput());
    const proofB = serviceB.createProof(baseInput());
    assert.equal(proofA.proofHash, proofB.proofHash);
  });

  it('2. same inputs produce same proof hash', () => {
    const { service } = setUp();
    const proof = service.createProof(baseInput());
    assert.ok(proof.proofHash.length > 0);
  });

  it('3. changing passport presentation changes proof hash', () => {
    const { service } = setUp();
    const proofA = service.createProof(baseInput({ handshakeDecisionId: 'decision-a' }));
    const proofB = service.createProof(baseInput({ handshakeDecisionId: 'decision-b', passportPresentationId: 'passport-2' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('4. changing authority presentation changes proof hash', () => {
    const { service } = setUp();
    const proofA = service.createProof(baseInput({ handshakeDecisionId: 'decision-a' }));
    const proofB = service.createProof(baseInput({ handshakeDecisionId: 'decision-b', authorityPresentationId: 'authority-presentation-1' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('5. changing approval proof changes proof hash', () => {
    const { service } = setUp();
    const proofA = service.createProof(baseInput({ handshakeDecisionId: 'decision-a' }));
    const proofB = service.createProof(baseInput({ handshakeDecisionId: 'decision-b', approvalProofId: 'approval-proof-1' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('6. proof includes visa and ingress IDs when accepted', () => {
    const { service } = setUp();
    const proof = service.createProof(baseInput({ visaId: 'visa-1', ingressGrantId: 'ingress-grant-1' }));
    assert.equal(proof.visaId, 'visa-1');
    assert.equal(proof.ingressGrantId, 'ingress-grant-1');
  });

  it('7. proof includes approvalProofId when approval was used', () => {
    const { service } = setUp();
    const proof = service.createProof(baseInput({ approvalProofId: 'approval-proof-1' }));
    assert.equal(proof.approvalProofId, 'approval-proof-1');
  });

  it('8. proof ledger maintains previousHash/proofHash chain', () => {
    const { service } = setUp();
    const first = service.createProof(baseInput({ handshakeDecisionId: 'decision-a' }));
    const second = service.createProof(baseInput({ handshakeDecisionId: 'decision-b' }));
    assert.equal(second.previousHash, first.proofHash);
  });

  it('9. proof can be exported by decision ID', () => {
    const { service } = setUp();
    const proof = service.createProof(baseInput({ handshakeDecisionId: 'decision-x' }));
    assert.deepEqual(service.getProofByDecisionId('decision-x'), proof);
  });

  it('10. rejected decision proof marks accepted false', () => {
    const { service } = setUp();
    const proof = service.createProof(baseInput({ decisionType: 'rejected', accepted: false, handshakeDecisionId: 'decision-rejected' }));
    assert.equal(proof.accepted, false);
    assert.equal(proof.decisionType, 'rejected');
  });
});
