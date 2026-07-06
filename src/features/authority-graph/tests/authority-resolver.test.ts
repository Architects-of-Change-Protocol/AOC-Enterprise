import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';
import { AuthorityResolver } from '../services/authority-resolver.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const PROJECT_SCOPE = 'project:HMP-14665';

const victorGrant: AuthorityGrant = {
  id: 'authority-grant-victor',
  issuerActorId: 'actor-datasys',
  subjectActorId: 'actor-victor',
  trustDomainId: TRUST_DOMAIN,
  capability: 'project_closure.management',
  actions: ['draft_closure_email', 'send_client_follow_up'],
  resourceScopes: [PROJECT_SCOPE],
  canDelegate: true,
  maxDelegationDepth: 1,
  status: 'active',
  issuedAt: NOW,
};

const pmfreakDelegation: DelegationGrant = {
  id: 'delegation-grant-pmfreak',
  delegatorActorId: 'actor-victor',
  delegateActorId: 'actor-pmfreak',
  principalActorId: 'actor-victor',
  trustDomainId: TRUST_DOMAIN,
  sourceAuthorityGrantId: victorGrant.id,
  capability: 'project_closure.drafting',
  actions: ['draft_closure_email'],
  resourceScopes: [PROJECT_SCOPE],
  delegationDepth: 1,
  canRedelegate: false,
  maxDelegationDepth: 1,
  status: 'active',
  issuedAt: NOW,
};

function setUp() {
  const ctx = createAuthorityRuntimeContext(NOW);
  const store = new AuthorityGraphStore();
  store.putGrant(victorGrant);
  store.putDelegation(pmfreakDelegation);
  const resolver = new AuthorityResolver(ctx, store);
  return { ctx, store, resolver };
}

function request(overrides: { actorId: string; action: string; resourceScope?: string }) {
  return {
    id: 'chain-request-1',
    actorId: overrides.actorId,
    trustDomainId: TRUST_DOMAIN,
    action: overrides.action,
    resourceScope: overrides.resourceScope ?? PROJECT_SCOPE,
    requestedAt: NOW,
  };
}

describe('AuthorityResolver', () => {
  it('1. resolves the Datasys -> Victor -> PMFreak Closure Agent chain', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(chain.status, 'valid');
    assert.equal(chain.grants[0]?.id, victorGrant.id);
    assert.equal(chain.delegations[0]?.id, pmfreakDelegation.id);
    assert.equal(chain.rootIssuerActorId, 'actor-datasys');
  });

  it('2. returns a partial chain when authority is missing for the requested action', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'approve_payment' }));
    assert.equal(chain.status, 'partial');
    assert.equal(chain.delegations.length, 1);
  });

  it('3. resolves direct human authority', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-victor', action: 'send_client_follow_up' }));
    assert.equal(chain.status, 'valid');
    assert.equal(chain.grants.length, 1);
    assert.equal(chain.delegations.length, 0);
  });

  it('4. resolves delegated agent authority', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(chain.status, 'valid');
    assert.equal(chain.delegations.length, 1);
  });

  it('5. does not resolve rogue external agent authority', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-unknown-external-agent', action: 'read_internal_documents' }));
    assert.equal(chain.status, 'invalid');
    assert.equal(chain.grants.length, 0);
    assert.equal(chain.delegations.length, 0);
  });

  it('6. includes grants in the AuthorityChain', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.deepEqual(chain.grants, [victorGrant]);
  });

  it('7. includes delegations in the AuthorityChain', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.deepEqual(chain.delegations, [pmfreakDelegation]);
  });

  it('8. computes the correct chain depth', () => {
    const { resolver } = setUp();
    const directChain = resolver.resolveAuthorityChain(request({ actorId: 'actor-victor', action: 'send_client_follow_up' }));
    assert.equal(directChain.depth, 0);
    const delegatedChain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(delegatedChain.depth, 1);
  });

  it('9. resolves the terminal actor correctly', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(chain.terminalActorId, 'actor-pmfreak');
    assert.equal(chain.actorId, 'actor-pmfreak');
  });

  it('10. resolves the root issuer correctly', () => {
    const { resolver } = setUp();
    const chain = resolver.resolveAuthorityChain(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(chain.rootIssuerActorId, 'actor-datasys');
  });
});
