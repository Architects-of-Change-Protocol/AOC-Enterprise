export type ExternalAuthorityPresentationStatus = 'presented' | 'valid' | 'invalid' | 'missing' | 'expired' | 'revoked' | 'insufficient_scope';

export interface ExternalAuthorityPresentation {
  readonly id: string;

  readonly externalAgentId: string;
  readonly handshakeRequestId: string;

  readonly externalAuthorityProofId?: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;

  readonly principalActorId?: string;
  readonly responsibleOrganizationId?: string;

  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];

  readonly status: ExternalAuthorityPresentationStatus;

  readonly presentedAt: string;

  readonly proofHash?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
