import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityGrantService } from '../services/authority-grant-service.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';
import { RoleAssignmentService } from '../services/role-assignment-service.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const ctx = createAuthorityRuntimeContext(NOW);
  const store = new AuthorityGraphStore();
  const authorityGrantService = new AuthorityGrantService(ctx, store);
  const service = new RoleAssignmentService(ctx, store, authorityGrantService);
  store.registerRootIssuer('trust-domain-1', 'actor-datasys');
  return { ctx, store, authorityGrantService, service };
}

describe('RoleAssignmentService', () => {
  it('1. can assign a role to Victor', () => {
    const { service } = setUp();
    const roleAssignment = service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });

    assert.equal(roleAssignment.actorId, 'actor-victor');
    assert.equal(roleAssignment.roleId, 'role-project-manager');
    assert.equal(roleAssignment.status, 'active');
    assert.ok(roleAssignment.id.length > 0);
  });

  it('2. can retrieve roles for an actor', () => {
    const { service } = setUp();
    service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });
    service.assignRole({
      actorId: 'actor-other',
      roleId: 'role-finance-approver',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });

    const roles = service.findRolesForActor('actor-victor');
    assert.equal(roles.length, 1);
    assert.equal(roles[0]?.roleId, 'role-project-manager');
  });

  it('3. can revoke a role assignment', () => {
    const { service } = setUp();
    const roleAssignment = service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });
    const revoked = service.revokeRoleAssignment(roleAssignment.id);
    assert.equal(revoked.status, 'revoked');
  });

  it('4. can suspend a role assignment', () => {
    const { service } = setUp();
    const roleAssignment = service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });
    const suspended = service.suspendRoleAssignment(roleAssignment.id);
    assert.equal(suspended.status, 'suspended');
  });

  it('5. can expire a role assignment', () => {
    const { service } = setUp();
    const roleAssignment = service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });
    const expired = service.expireRoleAssignment(roleAssignment.id);
    assert.equal(expired.status, 'expired');
  });

  it('6. role assignment is scoped to a trust domain', () => {
    const { service, store } = setUp();
    service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });
    service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-2',
      resourceScopes: ['project:GCH-15992'],
    });

    assert.equal(store.getRoleAssignmentsForTrustDomain('trust-domain-1').length, 1);
    assert.equal(store.getRoleAssignmentsForTrustDomain('trust-domain-2').length, 1);
    assert.equal(service.findRolesForTrustDomain('trust-domain-1').length, 1);
  });

  it('7. role assignment is scoped to a resource scope', () => {
    const { service } = setUp();
    const roleAssignment = service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });

    assert.deepEqual(roleAssignment.resourceScopes, ['project:HMP-14665']);
  });

  it('8. can derive an authority grant from an active role assignment, clipped to its resource scopes', () => {
    const { service } = setUp();
    const roleAssignment = service.assignRole({
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
    });

    const grant = service.deriveAuthorityGrantFromRole(roleAssignment.id, {
      issuerActorId: 'actor-datasys',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665', 'project:GCH-15992'],
      canDelegate: true,
    });

    assert.equal(grant.subjectActorId, 'actor-victor');
    assert.equal(grant.trustDomainId, 'trust-domain-1');
    assert.equal(grant.roleId, 'role-project-manager');
    assert.deepEqual(grant.resourceScopes, ['project:HMP-14665']);
  });

  it('throws when deriving an authority grant from an unknown role assignment', () => {
    const { service } = setUp();
    assert.throws(() =>
      service.deriveAuthorityGrantFromRole('missing', {
        issuerActorId: 'actor-datasys',
        capability: 'project_closure.management',
        actions: ['draft_closure_email'],
        resourceScopes: ['project:HMP-14665'],
      }),
    );
  });
});
