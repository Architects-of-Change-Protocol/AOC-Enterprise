import type { RoleAssignment } from '../domain/role-assignment.js';
import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import { RoleAssignmentNotFoundError } from '../runtime/authority-runtime-errors.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';
import type { AuthorityGrantService, IssueAuthorityGrantInput } from './authority-grant-service.js';

export interface AssignRoleInput {
  readonly id?: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly assignedByActorId: string;
  readonly trustDomainId: string;
  readonly resourceScopes: readonly string[];
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type DeriveAuthorityGrantFromRoleInput = Omit<
  IssueAuthorityGrantInput,
  'subjectActorId' | 'trustDomainId' | 'roleId'
>;

export class RoleAssignmentService {
  constructor(
    private readonly ctx: AuthorityRuntimeContext,
    private readonly store: AuthorityGraphStore,
    private readonly authorityGrantService: AuthorityGrantService,
  ) {}

  assignRole(input: AssignRoleInput): RoleAssignment {
    const id = input.id ?? this.ctx.ids.nextId('role-assignment');
    const roleAssignment: RoleAssignment = {
      id,
      actorId: input.actorId,
      roleId: input.roleId,
      assignedByActorId: input.assignedByActorId,
      trustDomainId: input.trustDomainId,
      resourceScopes: input.resourceScopes,
      status: 'active',
      assignedAt: this.ctx.clock.now(),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.putRoleAssignment(roleAssignment);
    return roleAssignment;
  }

  getRoleAssignment(roleAssignmentId: string): RoleAssignment | undefined {
    return this.store.getRoleAssignment(roleAssignmentId);
  }

  findRolesForActor(actorId: string): readonly RoleAssignment[] {
    return this.store.getRoleAssignmentsForActor(actorId);
  }

  findRolesForTrustDomain(trustDomainId: string): readonly RoleAssignment[] {
    return this.store.getRoleAssignmentsForTrustDomain(trustDomainId);
  }

  revokeRoleAssignment(roleAssignmentId: string): RoleAssignment {
    return this.store.updateRoleAssignmentStatus(roleAssignmentId, 'revoked');
  }

  suspendRoleAssignment(roleAssignmentId: string): RoleAssignment {
    return this.store.updateRoleAssignmentStatus(roleAssignmentId, 'suspended');
  }

  expireRoleAssignment(roleAssignmentId: string): RoleAssignment {
    return this.store.updateRoleAssignmentStatus(roleAssignmentId, 'expired');
  }

  /** Turns an active role assignment into a real AuthorityGrant, scoped to the role's resourceScopes. */
  deriveAuthorityGrantFromRole(roleAssignmentId: string, input: DeriveAuthorityGrantFromRoleInput): AuthorityGrant {
    const roleAssignment = this.store.getRoleAssignment(roleAssignmentId);
    if (!roleAssignment) {
      throw new RoleAssignmentNotFoundError(roleAssignmentId);
    }
    const resourceScopes = input.resourceScopes.filter((scope) => roleAssignment.resourceScopes.includes(scope));
    return this.authorityGrantService.issueAuthorityGrant({
      ...input,
      subjectActorId: roleAssignment.actorId,
      trustDomainId: roleAssignment.trustDomainId,
      roleId: roleAssignment.roleId,
      resourceScopes,
    });
  }
}
