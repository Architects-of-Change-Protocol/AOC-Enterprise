export type ExternalAgentStandingType =
  | 'no_standing'
  | 'pending_handshake'
  | 'limited_standing'
  | 'recognized_temporarily'
  | 'quarantined'
  | 'revoked'
  | 'expired';

export interface ExternalAgentStanding {
  readonly id: string;

  readonly externalAgentId: string;
  readonly localTrustDomainId: string;

  readonly type: ExternalAgentStandingType;

  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;

  readonly validFrom?: string;
  readonly validUntil?: string;

  readonly reasonCode: string;
  readonly reason: string;

  readonly evaluatedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
