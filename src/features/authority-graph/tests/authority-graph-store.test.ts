import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthorityEdge } from '../domain/authority-edge.js';
import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { AuthorityNode } from '../domain/authority-node.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { RoleAssignment } from '../domain/role-assignment.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';

const NOW = '2026-01-01T00:00:00.000Z';

function baseGrant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    id: 'authority-grant-1',
    issuerActorId: 'actor-datasys',
    subjectActorId: 'actor-victor',
    trustDomainId: 'trust-domain-1',
    capability: 'project_closure.management',
    actions: ['draft_closure_email'],
    resourceScopes: ['project:HMP-14665'],
    canDelegate: true,
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

function baseDelegation(overrides: Partial<DelegationGrant> = {}): DelegationGrant {
  return {
    id: 'delegation-grant-1',
    delegatorActorId: 'actor-victor',
    delegateActorId: 'actor-pmfreak',
    principalActorId: 'actor-victor',
    trustDomainId: 'trust-domain-1',
    sourceAuthorityGrantId: 'authority-grant-1',
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email'],
    resourceScopes: ['project:HMP-14665'],
    delegationDepth: 1,
    canRedelegate: false,
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

describe('AuthorityGraphStore', () => {
  it('1. can store and retrieve an AuthorityNode', () => {
    const store = new AuthorityGraphStore();
    const node: AuthorityNode = {
      id: 'node-datasys',
      type: 'organization',
      label: 'Datasys',
      createdAt: NOW,
      updatedAt: NOW,
    };
    store.putNode(node);
    assert.deepEqual(store.getNode('node-datasys'), node);
    assert.equal(store.getNode('missing'), undefined);
  });

  it('2. can store and retrieve an AuthorityEdge', () => {
    const store = new AuthorityGraphStore();
    const edge: AuthorityEdge = {
      id: 'edge-1',
      type: 'grants_authority',
      fromNodeId: 'node-datasys',
      toNodeId: 'node-victor',
      trustDomainId: 'trust-domain-1',
      status: 'active',
      createdAt: NOW,
    };
    store.putEdge(edge);
    assert.deepEqual(store.getEdge('edge-1'), edge);
  });

  it('3. can store and retrieve an AuthorityGrant', () => {
    const store = new AuthorityGraphStore();
    const grant = baseGrant();
    store.putGrant(grant);
    assert.deepEqual(store.getGrant(grant.id), grant);
  });

  it('4. can store and retrieve a DelegationGrant', () => {
    const store = new AuthorityGraphStore();
    const delegation = baseDelegation();
    store.putDelegation(delegation);
    assert.deepEqual(store.getDelegation(delegation.id), delegation);
  });

  it('5. can query authority grants by subject actor', () => {
    const store = new AuthorityGraphStore();
    store.putGrant(baseGrant({ id: 'g1', subjectActorId: 'actor-victor' }));
    store.putGrant(baseGrant({ id: 'g2', subjectActorId: 'actor-other' }));
    const results = store.getGrantsBySubjectActor('actor-victor');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'g1');
  });

  it('6. can query authority grants by trust domain', () => {
    const store = new AuthorityGraphStore();
    store.putGrant(baseGrant({ id: 'g1', trustDomainId: 'domain-a' }));
    store.putGrant(baseGrant({ id: 'g2', trustDomainId: 'domain-b' }));
    const results = store.getGrantsByTrustDomain('domain-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'g1');
  });

  it('also queries authority grants by issuer actor', () => {
    const store = new AuthorityGraphStore();
    store.putGrant(baseGrant({ id: 'g1', issuerActorId: 'actor-datasys' }));
    store.putGrant(baseGrant({ id: 'g2', issuerActorId: 'actor-other' }));
    const results = store.getGrantsByIssuerActor('actor-datasys');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'g1');
  });

  it('7. can query delegation grants by delegate actor', () => {
    const store = new AuthorityGraphStore();
    store.putDelegation(baseDelegation({ id: 'd1', delegateActorId: 'actor-pmfreak' }));
    store.putDelegation(baseDelegation({ id: 'd2', delegateActorId: 'actor-other' }));
    const results = store.getDelegationsByDelegateActor('actor-pmfreak');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'd1');
  });

  it('also queries delegation grants by delegator actor and by trust domain', () => {
    const store = new AuthorityGraphStore();
    store.putDelegation(baseDelegation({ id: 'd1', delegatorActorId: 'actor-victor', trustDomainId: 'domain-a' }));
    store.putDelegation(baseDelegation({ id: 'd2', delegatorActorId: 'actor-other', trustDomainId: 'domain-b' }));
    assert.equal(store.getDelegationsByDelegatorActor('actor-victor').length, 1);
    assert.equal(store.getDelegationsByTrustDomain('domain-a').length, 1);
  });

  it('8. can update grant status to revoked', () => {
    const store = new AuthorityGraphStore();
    store.putGrant(baseGrant({ id: 'g1' }));
    const updated = store.updateGrantStatus('g1', 'revoked');
    assert.equal(updated.status, 'revoked');
    assert.equal(store.getGrant('g1')?.status, 'revoked');
  });

  it('9. can update delegation status to revoked', () => {
    const store = new AuthorityGraphStore();
    store.putDelegation(baseDelegation({ id: 'd1' }));
    const updated = store.updateDelegationStatus('d1', 'revoked');
    assert.equal(updated.status, 'revoked');
    assert.equal(store.getDelegation('d1')?.status, 'revoked');
  });

  it('10. can store and retrieve role assignments', () => {
    const store = new AuthorityGraphStore();
    const roleAssignment: RoleAssignment = {
      id: 'role-assignment-1',
      actorId: 'actor-victor',
      roleId: 'role-project-manager',
      assignedByActorId: 'actor-datasys',
      trustDomainId: 'trust-domain-1',
      resourceScopes: ['project:HMP-14665'],
      status: 'active',
      assignedAt: NOW,
    };
    store.putRoleAssignment(roleAssignment);
    assert.deepEqual(store.getRoleAssignment(roleAssignment.id), roleAssignment);
    assert.equal(store.getRoleAssignmentsForActor('actor-victor').length, 1);
    const updated = store.updateRoleAssignmentStatus(roleAssignment.id, 'revoked');
    assert.equal(updated.status, 'revoked');
  });

  it('tracks root issuers and cross-domain acceptance per trust domain', () => {
    const store = new AuthorityGraphStore();
    assert.equal(store.isRootIssuer('domain-a', 'actor-datasys'), false);
    store.registerRootIssuer('domain-a', 'actor-datasys');
    assert.equal(store.isRootIssuer('domain-a', 'actor-datasys'), true);
    assert.equal(store.isRootIssuer('domain-b', 'actor-datasys'), false);

    assert.equal(store.isCrossDomainAuthorityAccepted('domain-a'), false);
    store.acceptCrossDomainAuthority('domain-a');
    assert.equal(store.isCrossDomainAuthorityAccepted('domain-a'), true);
  });

  it('throws when updating status for an unknown grant, delegation or role assignment', () => {
    const store = new AuthorityGraphStore();
    assert.throws(() => store.updateGrantStatus('missing', 'revoked'));
    assert.throws(() => store.updateDelegationStatus('missing', 'revoked'));
    assert.throws(() => store.updateRoleAssignmentStatus('missing', 'revoked'));
  });
});
