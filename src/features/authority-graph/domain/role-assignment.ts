export type RoleAssignmentStatus = 'active' | 'expired' | 'suspended' | 'revoked';

/**
 * Connects a human or actor to a role inside a trust domain. A RoleAssignment
 * carries no authority by itself; AuthorityGrantService.deriveGrantFromRole can
 * turn one into an AuthorityGrant when the role needs to carry real authority.
 */
export interface RoleAssignment {
  readonly id: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly assignedByActorId: string;
  readonly trustDomainId: string;
  readonly resourceScopes: readonly string[];
  readonly status: RoleAssignmentStatus;
  readonly assignedAt: string;
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
