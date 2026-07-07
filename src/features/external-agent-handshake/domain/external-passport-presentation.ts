export type ExternalPassportPresentationStatus = 'presented' | 'valid' | 'invalid' | 'expired' | 'revoked' | 'issuer_untrusted';

export interface ExternalPassportPresentation {
  readonly id: string;

  readonly externalAgentId: string;
  readonly externalIssuerId?: string;
  readonly externalTrustDomainId?: string;

  readonly claimedPassportId: string;

  readonly status: ExternalPassportPresentationStatus;

  readonly subjectActorId?: string;
  readonly subjectDisplayName?: string;

  readonly issuedAt?: string;
  readonly expiresAt?: string;

  readonly presentedAt: string;

  readonly proofHash?: string;
  readonly presentationHash: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
