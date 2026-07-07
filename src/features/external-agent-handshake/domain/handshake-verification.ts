export interface HandshakeVerificationInput {
  readonly handshakeRequestId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;

  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;

  readonly requestedAt: string;
}

export type HandshakeVerificationResultType =
  | 'standing_valid'
  | 'standing_missing'
  | 'handshake_required'
  | 'handshake_pending'
  | 'handshake_rejected'
  | 'handshake_quarantined'
  | 'visa_expired'
  | 'visa_revoked'
  | 'ingress_denied'
  | 'scope_denied'
  | 'capability_denied'
  | 'approval_required';

export interface HandshakeVerificationResult {
  readonly type: HandshakeVerificationResultType;
  readonly valid: boolean;

  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;

  readonly reasonCode: string;
  readonly reason: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
