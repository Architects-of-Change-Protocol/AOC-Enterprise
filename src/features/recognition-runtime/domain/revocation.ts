export type RevocableEntityType = 'actor' | 'passport' | 'capability_token';

export interface RevocationCheckInput {
  readonly actorId: string;
  readonly passportId?: string;
  readonly capabilityTokenId?: string;
}

export interface RevocationCheckResult {
  readonly revoked: boolean;
  readonly revokedEntityType?: RevocableEntityType;
  readonly revokedEntityId?: string;
}
