import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandshakeRuntimeContext, createManualHandshakeClock, createSequentialHandshakeIdGenerator } from '../runtime/handshake-runtime-context.js';
import { HandshakeChallengeService } from '../services/handshake-challenge-service.js';
import { HandshakeLedger } from '../services/handshake-ledger.js';
import { HandshakeStore } from '../services/handshake-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

function setUp() {
  const clock = createManualHandshakeClock(NOW);
  const ctx = { clock, ids: createSequentialHandshakeIdGenerator() };
  const store = new HandshakeStore();
  const ledger = new HandshakeLedger(ctx, store);
  return { service: new HandshakeChallengeService(ctx, store, ledger), ledger, clock };
}

describe('HandshakeChallengeService', () => {
  it('1. can issue challenge', () => {
    const { service } = setUp();
    const challenge = service.issueChallenge({
      handshakeRequestId: 'handshake-request-1',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'external-agent-1',
      challengePurpose: 'prove_control',
    });
    assert.equal(challenge.status, 'issued');
  });

  it('2. challenge nonce is deterministic', () => {
    const { service: serviceA } = setUp();
    const { service: serviceB } = setUp();
    const challengeA = serviceA.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    const challengeB = serviceB.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    assert.equal(challengeA.challengeNonce, challengeB.challengeNonce);
  });

  it('3. can answer challenge', () => {
    const { service } = setUp();
    const challenge = service.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    const expected = service.computeExpectedResponse(challenge.id)!;
    const answered = service.answerChallenge(challenge.id, expected);
    assert.equal(answered.status, 'valid');
  });

  it('4. valid challenge response passes', () => {
    const { service } = setUp();
    const challenge = service.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    const expected = service.computeExpectedResponse(challenge.id)!;
    service.answerChallenge(challenge.id, expected);
    const verification = service.verifyChallengeResponse(challenge.id);
    assert.equal(verification.valid, true);
  });

  it('5. invalid challenge response fails', () => {
    const { service } = setUp();
    const challenge = service.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    service.answerChallenge(challenge.id, 'wrong-response');
    const verification = service.verifyChallengeResponse(challenge.id);
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'CHALLENGE_INVALID');
  });

  it('6. expired challenge fails', () => {
    const { service, clock } = setUp();
    const challenge = service.issueChallenge({
      handshakeRequestId: 'req',
      localTrustDomainId: TRUST_DOMAIN,
      externalAgentId: 'agent',
      challengePurpose: 'prove_control',
      expiresInMinutes: 1,
    });
    const expected = service.computeExpectedResponse(challenge.id)!;
    clock.advance(2 * 60_000);
    const answered = service.answerChallenge(challenge.id, expected);
    assert.equal(answered.status, 'expired');
    assert.equal(service.verifyChallengeResponse(challenge.id).reasonCode, 'CHALLENGE_EXPIRED');
  });

  it('7. revoked challenge fails', () => {
    const { service } = setUp();
    const challenge = service.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    service.revokeChallenge(challenge.id);
    const verification = service.verifyChallengeResponse(challenge.id);
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'CHALLENGE_REVOKED');
  });

  it('8. records challenge issued and answered events', () => {
    const { service, ledger } = setUp();
    const challenge = service.issueChallenge({ handshakeRequestId: 'req', localTrustDomainId: TRUST_DOMAIN, externalAgentId: 'agent', challengePurpose: 'prove_control' });
    const expected = service.computeExpectedResponse(challenge.id)!;
    service.answerChallenge(challenge.id, expected);
    const events = ledger.getTrailByRequestId('req');
    assert.ok(events.some((event) => event.type === 'handshake_challenge_issued'));
    assert.ok(events.some((event) => event.type === 'handshake_challenge_answered'));
  });
});
