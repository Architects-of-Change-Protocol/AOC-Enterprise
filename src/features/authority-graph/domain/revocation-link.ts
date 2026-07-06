export type RevocableAuthorityEntityType = 'authority_grant' | 'delegation_grant' | 'role_assignment';

/** Tracks revocation lineage: who revoked what, and why. */
export interface RevocationLink {
  readonly id: string;
  readonly revokedEntityType: RevocableAuthorityEntityType;
  readonly revokedEntityId: string;
  readonly revokedByActorId: string;
  readonly trustDomainId: string;
  readonly reason: string;
  readonly revokedAt: string;
}
