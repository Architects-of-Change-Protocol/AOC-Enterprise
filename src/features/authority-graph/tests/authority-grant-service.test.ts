import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityGrantService } from '../services/authority-grant-service.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import { IssuerNotAuthorizedError, SelfIssuanceNotPermittedError } from '../runtime/authority-runtime-errors.js';

const NOW = '2026-01-01T00:00:00.000Z';

function assertThrowsInstance(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  try {
    fn();
    assert.ok(false, 'expected function to throw');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}`);
  }
}

function setUp() {
  const ctx = createAuthorityRuntimeContext(NOW);
  const store = new AuthorityGraphStore();
  const service = new AuthorityGrantService(ctx, store);
  store.registerRootIssuer('trust-domain-1', 'actor-datasys');
  return { ctx, store, service };
}

describe('AuthorityGrantService', () => {
  it('1. can create an organization-to-human authority grant', () => {
    const { service } = setUp();
    const grant = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
      canDelegate: true,
    });

    assert.equal(grant.issuerActorId, 'actor-datasys');
    assert.equal(grant.subjectActorId, 'actor-victor');
    assert.equal(grant.status, 'active');
    assert.ok(grant.id.length > 0);
  });

  it('2. can retrieve an authority grant', () => {
    const { service } = setUp();
    const grant = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
    });
    assert.deepEqual(service.getAuthorityGrant(grant.id), grant);
    assert.equal(service.getAuthorityGrant('missing'), undefined);
  });

  it('3. can revoke an authority grant', () => {
    const { service } = setUp();
    const grant = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
    });
    const revoked = service.revokeAuthorityGrant(grant.id);
    assert.equal(revoked.status, 'revoked');
  });

  it('4. can suspend an authority grant', () => {
    const { service } = setUp();
    const grant = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
    });
    const suspended = service.suspendAuthorityGrant(grant.id);
    assert.equal(suspended.status, 'suspended');
  });

  it('5. can expire an authority grant', () => {
    const { service } = setUp();
    const grant = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
    });
    const expired = service.expireAuthorityGrant(grant.id);
    assert.equal(expired.status, 'expired');
  });

  it('6. can find authority for actor, action and scope', () => {
    const { service } = setUp();
    service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
    });

    const found = service.findAuthorityForActorAction({
      actorId: 'actor-victor',
      action: 'draft_closure_email',
      trustDomainId: 'trust-domain-1',
    });
    assert.equal(found.length, 1);

    const notFound = service.findAuthorityForActorAction({
      actorId: 'actor-victor',
      action: 'approve_payment',
      trustDomainId: 'trust-domain-1',
    });
    assert.equal(notFound.length, 0);
  });

  it('7. blocks an authority grant when a non-root issuer lacks authority', () => {
    const { service } = setUp();
    assertThrowsInstance(
      () =>
        service.issueAuthorityGrant({
          issuerActorId: 'actor-victor',
          subjectActorId: 'actor-pmfreak',
          trustDomainId: 'trust-domain-1',
          capability: 'project_closure.drafting',
          actions: ['draft_closure_email'],
          resourceScopes: ['project:HMP-14665'],
        }),
      IssuerNotAuthorizedError,
    );
  });

  it('8. allows the root issuer to grant initial authority inside its trust domain', () => {
    const { service } = setUp();
    const grant = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
    });
    assert.equal(grant.status, 'active');
  });

  it('blocks self-issuance even for an actor that happens to be the root issuer', () => {
    const { service } = setUp();
    assertThrowsInstance(
      () =>
        service.issueAuthorityGrant({
          issuerActorId: 'actor-datasys',
          subjectActorId: 'actor-datasys',
          trustDomainId: 'trust-domain-1',
          capability: 'project_closure.management',
          actions: ['draft_closure_email'],
          resourceScopes: ['project:HMP-14665'],
        }),
      SelfIssuanceNotPermittedError,
    );
  });

  it('allows non-root issuers to sub-grant from a parent grant that permits delegation', () => {
    const { service } = setUp();
    const parent = service.issueAuthorityGrant({
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email', 'summarize_project_status'],
      resourceScopes: ['project:HMP-14665'],
      canDelegate: true,
    });

    const child = service.issueAuthorityGrant({
      issuerActorId: 'actor-victor',
      subjectActorId: 'actor-deputy',
      trustDomainId: 'trust-domain-1',
      capability: 'project_closure.management',
      actions: ['draft_closure_email'],
      resourceScopes: ['project:HMP-14665'],
      parentGrantId: parent.id,
    });

    assert.equal(child.parentGrantId, parent.id);
  });
});
