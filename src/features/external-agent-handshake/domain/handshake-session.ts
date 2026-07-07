export type HandshakeSessionStatus =
  | 'open'
  | 'challenged'
  | 'verifying'
  | 'accepted'
  | 'rejected'
  | 'quarantined'
  | 'expired'
  | 'revoked'
  | 'closed';

export interface HandshakeSession {
  readonly id: string;

  readonly handshakeRequestId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly status: HandshakeSessionStatus;

  readonly decisionId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly proofId?: string;

  readonly openedAt: string;
  readonly closedAt?: string;
  readonly expiresAt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
