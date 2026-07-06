import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthorityGrant } from '../domain/authority-grant.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';
import { DelegationService } from '../services/delegation-service.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import {
  DelegationDepthExceededError,
  DelegationNotPermittedError,
  DelegationScopeExpansionError,
  NonDelegableActionError,
  SelfIssuanceNotPermittedError,
} from '../runtime/authority-runtime-errors.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const PROJECT_SCOPE = 'project:HMP-14665';
const OTHER_SCOPE = 'project:GCH-15992';

function baseVictorGrant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    id: 'authority-grant-victor',
    issuerActorId: 'actor-datasys',
    subjectActorId: 'actor-victor',
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.management',
    actions: ['draft_closure_email', 'summarize_project_status', 'send_final_invoice'],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    maxDelegationDepth: 1,
    allowedDelegateActorTypes: ['agent'],
    nonDelegableActions: ['send_final_invoice'],
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

function assertThrowsInstance(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  try {
    fn();
    assert.ok(false, 'expected function to throw');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}`);
  }
}

function setUp(grantOverrides: Partial<AuthorityGrant> = {}) {
  const ctx = createAuthorityRuntimeContext(NOW);
  const store = new AuthorityGraphStore();
  const service = new DelegationService(ctx, store);
  const grant = baseVictorGrant(grantOverrides);
  store.putGrant(grant);
  return { ctx, store, service, grant };
}

describe('DelegationService', () => {
  it('1. can create a valid human-to-agent delegation', () => {
    const { service, grant } = setUp();
    const delegation = service.createDelegationGrant({
      delegatorActorId: 'actor-victor',
      delegateActorId: 'actor-pmfreak',
      delegateActorType: 'agent',
      trustDomainId: TRUST_DOMAIN,
      sourceAuthorityGrantId: grant.id,
      capability: 'project_closure.drafting',
      actions: ['draft_closure_email'],
      resourceScopes: [PROJECT_SCOPE],
    });

    assert.equal(delegation.delegatorActorId, 'actor-victor');
    assert.equal(delegation.delegateActorId, 'actor-pmfreak');
    assert.equal(delegation.principalActorId, 'actor-victor');
    assert.equal(delegation.delegationDepth, 1);
    assert.equal(delegation.status, 'active');
  });

  it('2. blocks delegation when the delegator does not hold the source authority', () => {
    const { service, grant } = setUp();
    assertThrowsInstance(
      () =>
        service.createDelegationGrant({
          delegatorActorId: 'actor-impostor',
          delegateActorId: 'actor-pmfreak',
          delegateActorType: 'agent',
          trustDomainId: TRUST_DOMAIN,
          sourceAuthorityGrantId: grant.id,
          capability: 'project_closure.drafting',
          actions: ['draft_closure_email'],
          resourceScopes: [PROJECT_SCOPE],
        }),
      DelegationNotPermittedError,
    );
  });

  it('3. blocks delegation when the action is non-delegable', () => {
    const { service, grant } = setUp();
    assertThrowsInstance(
      () =>
        service.createDelegationGrant({
          delegatorActorId: 'actor-victor',
          delegateActorId: 'actor-pmfreak',
          delegateActorType: 'agent',
          trustDomainId: TRUST_DOMAIN,
          sourceAuthorityGrantId: grant.id,
          capability: 'project_closure.drafting',
          actions: ['send_final_invoice'],
          resourceScopes: [PROJECT_SCOPE],
        }),
      NonDelegableActionError,
    );
  });

  it('4. blocks delegation when the resource scope expands beyond the source authority', () => {
    const { service, grant } = setUp();
    assertThrowsInstance(
      () =>
        service.createDelegationGrant({
          delegatorActorId: 'actor-victor',
          delegateActorId: 'actor-pmfreak',
          delegateActorType: 'agent',
          trustDomainId: TRUST_DOMAIN,
          sourceAuthorityGrantId: grant.id,
          capability: 'project_closure.drafting',
          actions: ['draft_closure_email'],
          resourceScopes: [PROJECT_SCOPE, OTHER_SCOPE],
        }),
      DelegationScopeExpansionError,
    );
  });

  it('5. blocks delegation when the maximum delegation depth would be exceeded', () => {
    const { service, grant } = setUp({ maxDelegationDepth: 0 });
    assertThrowsInstance(
      () =>
        service.createDelegationGrant({
          delegatorActorId: 'actor-victor',
          delegateActorId: 'actor-pmfreak',
          delegateActorType: 'agent',
          trustDomainId: TRUST_DOMAIN,
          sourceAuthorityGrantId: grant.id,
          capability: 'project_closure.drafting',
          actions: ['draft_closure_email'],
          resourceScopes: [PROJECT_SCOPE],
        }),
      DelegationDepthExceededError,
    );
  });

  it('6. blocks delegation when the delegate actor type is not allowed', () => {
    const { service, grant } = setUp({ allowedDelegateActorTypes: ['human'] });
    assertThrowsInstance(
      () =>
        service.createDelegationGrant({
          delegatorActorId: 'actor-victor',
          delegateActorId: 'actor-pmfreak',
          delegateActorType: 'agent',
          trustDomainId: TRUST_DOMAIN,
          sourceAuthorityGrantId: grant.id,
          capability: 'project_closure.drafting',
          actions: ['draft_closure_email'],
          resourceScopes: [PROJECT_SCOPE],
        }),
      DelegationNotPermittedError,
    );
  });

  it('7. blocks a self-issued delegation', () => {
    const { service, grant } = setUp();
    assertThrowsInstance(
      () =>
        service.createDelegationGrant({
          delegatorActorId: 'actor-victor',
          delegateActorId: 'actor-victor',
          delegateActorType: 'human',
          trustDomainId: TRUST_DOMAIN,
          sourceAuthorityGrantId: grant.id,
          capability: 'project_closure.drafting',
          actions: ['draft_closure_email'],
          resourceScopes: [PROJECT_SCOPE],
        }),
      SelfIssuanceNotPermittedError,
    );
  });

  it('8. can revoke a delegation grant', () => {
    const { service, grant } = setUp();
    const delegation = service.createDelegationGrant({
      delegatorActorId: 'actor-victor',
      delegateActorId: 'actor-pmfreak',
      delegateActorType: 'agent',
      trustDomainId: TRUST_DOMAIN,
      sourceAuthorityGrantId: grant.id,
      capability: 'project_closure.drafting',
      actions: ['draft_closure_email'],
      resourceScopes: [PROJECT_SCOPE],
    });
    const revoked = service.revokeDelegationGrant(delegation.id);
    assert.equal(revoked.status, 'revoked');
  });

  it('9. can suspend a delegation grant', () => {
    const { service, grant } = setUp();
    const delegation = service.createDelegationGrant({
      delegatorActorId: 'actor-victor',
      delegateActorId: 'actor-pmfreak',
      delegateActorType: 'agent',
      trustDomainId: TRUST_DOMAIN,
      sourceAuthorityGrantId: grant.id,
      capability: 'project_closure.drafting',
      actions: ['draft_closure_email'],
      resourceScopes: [PROJECT_SCOPE],
    });
    const suspended = service.suspendDelegationGrant(delegation.id);
    assert.equal(suspended.status, 'suspended');
  });

  it('10. can expire a delegation grant', () => {
    const { service, grant } = setUp();
    const delegation = service.createDelegationGrant({
      delegatorActorId: 'actor-victor',
      delegateActorId: 'actor-pmfreak',
      delegateActorType: 'agent',
      trustDomainId: TRUST_DOMAIN,
      sourceAuthorityGrantId: grant.id,
      capability: 'project_closure.drafting',
      actions: ['draft_closure_email'],
      resourceScopes: [PROJECT_SCOPE],
    });
    const expired = service.expireDelegationGrant(delegation.id);
    assert.equal(expired.status, 'expired');
  });
});
