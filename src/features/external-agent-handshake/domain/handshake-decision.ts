export type HandshakeDecisionType = 'accepted' | 'accepted_limited' | 'requires_approval' | 'rejected' | 'quarantined' | 'expired' | 'revoked';

export interface HandshakeDecision {
  readonly id: string;

  readonly handshakeRequestId: string;
  readonly handshakeSessionId?: string;

  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly type: HandshakeDecisionType;
  readonly accepted: boolean;

  readonly reasonCode: string;
  readonly reason: string;

  readonly allowedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];

  readonly deniedCapabilities: readonly string[];
  readonly deniedActions: readonly string[];
  readonly deniedResourceScopes: readonly string[];

  readonly requiresApproval: boolean;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly proofId?: string;

  readonly decidedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
