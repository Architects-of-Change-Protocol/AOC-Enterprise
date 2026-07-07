export type HandshakeEventType =
  | 'handshake_submitted'
  | 'handshake_challenge_issued'
  | 'handshake_challenge_answered'
  | 'handshake_verification_started'
  | 'handshake_accepted'
  | 'handshake_accepted_limited'
  | 'handshake_requires_approval'
  | 'handshake_rejected'
  | 'handshake_quarantined'
  | 'handshake_expired'
  | 'handshake_revoked'
  | 'agent_visa_issued'
  | 'agent_visa_expired'
  | 'agent_visa_revoked'
  | 'ingress_grant_issued'
  | 'ingress_grant_revoked'
  | 'handshake_proof_created'
  | 'external_standing_evaluated';

export interface HandshakeEvent {
  readonly id: string;

  readonly type: HandshakeEventType;

  readonly localTrustDomainId: string;

  readonly externalAgentId?: string;
  readonly externalIssuerId?: string;

  readonly handshakeRequestId?: string;
  readonly handshakeSessionId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;

  readonly timestamp: string;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly previousHash?: string;
  readonly eventHash: string;
}
