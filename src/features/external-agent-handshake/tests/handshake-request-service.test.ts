import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import { createHandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeRequestService, type SubmitHandshakeRequestInput } from '../services/handshake-request-service.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const agent: ExternalAgentDescriptor = { id: 'external-agent-1', type: 'agent', status: 'known', displayName: 'Agent One', firstSeenAt: NOW };
const passport: ExternalPassportPresentation = {
  id: 'passport-presentation-1',
  externalAgentId: 'external-agent-1',
  claimedPassportId: 'claimed-passport-1',
  status: 'valid',
  presentedAt: NOW,
  presentationHash: 'hash-1',
};

function baseInput(overrides: Partial<SubmitHandshakeRequestInput> = {}): SubmitHandshakeRequestInput {
  return {
    localTrustDomainId: TRUST_DOMAIN,
    externalAgent: agent,
    passportPresentation: passport,
    requestedCapabilities: [],
    requestedActions: ['read_project_summary'],
    requestedResourceScopes: ['project:1'],
    ...overrides,
  };
}

function setUp() {
  const ctx = createHandshakeRuntimeContext(NOW);
  const store = new HandshakeStore();
  const ledger = new HandshakeLedger(ctx, store);
  return { service: new HandshakeRequestService(ctx, store, ledger), ledger };
}

describe('HandshakeRequestService', () => {
  it('1. can submit handshake request', () => {
    const { service } = setUp();
    const request = service.submitHandshakeRequest(baseInput());
    assert.equal(request.status, 'submitted');
  });

  it('2. can retrieve handshake request', () => {
    const { service } = setUp();
    const request = service.submitHandshakeRequest(baseInput());
    assert.deepEqual(service.getHandshakeRequest(request.id), request);
  });

  it('3. can cancel handshake request', () => {
    const { service } = setUp();
    const request = service.submitHandshakeRequest(baseInput());
    const cancelled = service.cancelHandshakeRequest(request.id);
    assert.equal(cancelled.status, 'cancelled');
  });

  it('4. can expire handshake request', () => {
    const { service } = setUp();
    const request = service.submitHandshakeRequest(baseInput());
    const expired = service.expireHandshakeRequest(request.id);
    assert.equal(expired.status, 'expired');
  });

  it('5. can quarantine handshake request', () => {
    const { service } = setUp();
    const request = service.submitHandshakeRequest(baseInput());
    const quarantined = service.quarantineHandshakeRequest(request.id, 'RISKY', 'Risky agent behavior detected.');
    assert.equal(quarantined.status, 'quarantined');
  });

  it('6. records handshake_submitted event', () => {
    const { service, ledger } = setUp();
    const request = service.submitHandshakeRequest(baseInput());
    const events = ledger.getTrailByRequestId(request.id);
    assert.ok(events.some((event) => event.type === 'handshake_submitted'));
  });

  it('7. duplicate active handshake is handled deterministically', () => {
    const { service } = setUp();
    const first = service.submitHandshakeRequest(baseInput());
    const second = service.submitHandshakeRequest(baseInput());
    assert.equal(second.id, first.id);
  });
});
