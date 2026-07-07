export type HandshakeChallengeStatus = 'issued' | 'answered' | 'valid' | 'invalid' | 'expired' | 'revoked';

export type HandshakeChallengePurpose = 'prove_control' | 'prove_passport' | 'prove_authority' | 'prove_session_continuity';

export interface HandshakeChallenge {
  readonly id: string;

  readonly handshakeRequestId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly challengeNonce: string;
  readonly challengePurpose: HandshakeChallengePurpose;

  readonly status: HandshakeChallengeStatus;

  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly answeredAt?: string;

  readonly responseHash?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
