import { createDigest } from '../domain/handshake-proof.js';
import type { HandshakeChallenge, HandshakeChallengePurpose } from '../domain/handshake-challenge.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeChallengeNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeLedger } from './handshake-ledger.js';
import type { HandshakeStore } from './handshake-store.js';

export interface IssueChallengeInput {
  readonly id?: string;
  readonly handshakeRequestId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;
  readonly challengePurpose: HandshakeChallengePurpose;
  readonly expiresInMinutes?: number;
}

export interface ChallengeVerification {
  readonly valid: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Issues and verifies deterministic control-proof challenges. The MVP does
 * not perform real cryptographic proof-of-control: the "expected" response is
 * a deterministic digest of the issued nonce, and an external agent proves it
 * received the nonce by echoing that same digest back. No Math.random, no
 * wall-clock -- the nonce comes from the injected sequential ID generator.
 */
export class HandshakeChallengeService {
  private readonly expectedResponseHashes = new Map<string, string>();

  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly ledger: HandshakeLedger,
  ) {}

  issueChallenge(input: IssueChallengeInput): HandshakeChallenge {
    const now = this.ctx.clock.now();
    const id = input.id ?? this.ctx.ids.nextId('handshake-challenge');
    const challengeNonce = this.ctx.ids.nextId('challenge-nonce');
    const expiresAt =
      input.expiresInMinutes !== undefined ? new Date(Date.parse(now) + input.expiresInMinutes * 60_000).toISOString() : undefined;

    const challenge: HandshakeChallenge = {
      id,
      handshakeRequestId: input.handshakeRequestId,
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      challengeNonce,
      challengePurpose: input.challengePurpose,
      status: 'issued',
      issuedAt: now,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
    this.expectedResponseHashes.set(id, createDigest({ challengeId: id, challengeNonce }));
    this.store.putHandshakeChallenge(challenge);

    this.ledger.recordEvent({
      type: 'handshake_challenge_issued',
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      handshakeRequestId: input.handshakeRequestId,
      payload: { challengeId: id, challengePurpose: input.challengePurpose },
    });

    return challenge;
  }

  getChallenge(handshakeChallengeId: string): HandshakeChallenge | undefined {
    return this.store.getHandshakeChallenge(handshakeChallengeId);
  }

  /** Computes the deterministic response an external agent that truly received the nonce would echo back. */
  computeExpectedResponse(handshakeChallengeId: string): string | undefined {
    return this.expectedResponseHashes.get(handshakeChallengeId);
  }

  answerChallenge(handshakeChallengeId: string, responseHash: string): HandshakeChallenge {
    const existing = this.store.getHandshakeChallenge(handshakeChallengeId);
    if (!existing) {
      throw new HandshakeChallengeNotFoundError(handshakeChallengeId);
    }
    const now = this.ctx.clock.now();
    const expired = existing.expiresAt !== undefined && Date.parse(now) >= Date.parse(existing.expiresAt);
    const expectedResponseHash = this.expectedResponseHashes.get(handshakeChallengeId);
    const status = expired ? 'expired' : responseHash === expectedResponseHash ? 'valid' : 'invalid';

    const answered: HandshakeChallenge = { ...existing, status, responseHash, answeredAt: now };
    this.store.putHandshakeChallenge(answered);

    this.ledger.recordEvent({
      type: 'handshake_challenge_answered',
      localTrustDomainId: existing.localTrustDomainId,
      externalAgentId: existing.externalAgentId,
      handshakeRequestId: existing.handshakeRequestId,
      payload: { challengeId: handshakeChallengeId, status },
    });

    return answered;
  }

  verifyChallengeResponse(handshakeChallengeId: string): ChallengeVerification {
    const challenge = this.store.getHandshakeChallenge(handshakeChallengeId);
    if (!challenge) {
      return { valid: false, reasonCode: 'CHALLENGE_MISSING', reason: `Challenge ${handshakeChallengeId} was not found.` };
    }
    if (challenge.status === 'revoked') {
      return { valid: false, reasonCode: 'CHALLENGE_REVOKED', reason: `Challenge ${handshakeChallengeId} was revoked.` };
    }
    if (challenge.status === 'expired') {
      return { valid: false, reasonCode: 'CHALLENGE_EXPIRED', reason: `Challenge ${handshakeChallengeId} expired.` };
    }
    if (challenge.status !== 'valid') {
      return { valid: false, reasonCode: 'CHALLENGE_INVALID', reason: `Challenge ${handshakeChallengeId} response is invalid or not yet answered.` };
    }
    return { valid: true, reasonCode: 'CHALLENGE_VALID', reason: `Challenge ${handshakeChallengeId} was answered correctly.` };
  }

  expireChallenge(handshakeChallengeId: string): HandshakeChallenge {
    const existing = this.store.getHandshakeChallenge(handshakeChallengeId);
    if (!existing) {
      throw new HandshakeChallengeNotFoundError(handshakeChallengeId);
    }
    return this.store.putHandshakeChallenge({ ...existing, status: 'expired' });
  }

  revokeChallenge(handshakeChallengeId: string): HandshakeChallenge {
    const existing = this.store.getHandshakeChallenge(handshakeChallengeId);
    if (!existing) {
      throw new HandshakeChallengeNotFoundError(handshakeChallengeId);
    }
    return this.store.putHandshakeChallenge({ ...existing, status: 'revoked' });
  }
}
