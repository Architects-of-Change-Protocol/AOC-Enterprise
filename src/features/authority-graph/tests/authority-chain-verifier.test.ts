import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import { AuthorityChainVerifier } from '../services/authority-chain-verifier.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';
import { AuthorityLineageLedger } from '../services/authority-lineage-ledger.js';
import { AuthorityProofService } from '../services/authority-proof-service.js';
import { AuthorityResolver } from '../services/authority-resolver.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const OTHER_DOMAIN = 'trust-domain-2';
const PROJECT_SCOPE = 'project:HMP-14665';
const OTHER_SCOPE = 'project:GCH-15992';

function victorGrant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    id: 'authority-grant-victor',
    issuerActorId: 'actor-datasys',
    subjectActorId: 'actor-victor',
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.management',
    actions: ['draft_closure_email'],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    maxDelegationDepth: 1,
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

function pmfreakDelegation(overrides: Partial<DelegationGrant> = {}): DelegationGrant {
  return {
    id: 'delegation-grant-pmfreak',
    delegatorActorId: 'actor-victor',
    delegateActorId: 'actor-pmfreak',
    principalActorId: 'actor-victor',
    trustDomainId: TRUST_DOMAIN,
    sourceAuthorityGrantId: 'authority-grant-victor',
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email'],
    resourceScopes: [PROJECT_SCOPE],
    delegationDepth: 1,
    canRedelegate: false,
    maxDelegationDepth: 1,
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

function setUp() {
  const ctx = createAuthorityRuntimeContext(NOW);
  const store = new AuthorityGraphStore();
  const resolver = new AuthorityResolver(ctx, store);
  const proofService = new AuthorityProofService(ctx);
  const ledger = new AuthorityLineageLedger(ctx);
  const verifier = new AuthorityChainVerifier(ctx, store, resolver, proofService, ledger);
  return { ctx, store, resolver, proofService, ledger, verifier };
}

function request(overrides: Partial<AuthorityChainRequest> & { actorId: string; action: string }): AuthorityChainRequest {
  return {
    id: 'chain-request-1',
    trustDomainId: TRUST_DOMAIN,
    resourceScope: PROJECT_SCOPE,
    requestedAt: NOW,
    ...overrides,
  };
}

describe('AuthorityChainVerifier', () => {
  it('1. a valid chain returns authority_valid', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant());
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'authority_valid');
    assert.equal(decision.valid, true);
    assert.ok(decision.proofId);
  });

  it('2. a missing chain returns authority_missing', () => {
    const { verifier } = setUp();
    const decision = verifier.verifyAuthority(request({ actorId: 'actor-unknown-external-agent', action: 'read_internal_documents' }));
    assert.equal(decision.type, 'authority_missing');
    assert.equal(decision.valid, false);
  });

  it('3. requesting a scope beyond the delegated authority returns scope_expansion_detected', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant());
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(
      request({ actorId: 'actor-pmfreak', action: 'draft_closure_email', resourceScope: OTHER_SCOPE }),
    );
    assert.equal(decision.type, 'scope_expansion_detected');
  });

  it('4. a non-delegable action reached through delegation returns non_delegable_action', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant({ actions: ['approve_payment'] }));
    store.putDelegation(
      pmfreakDelegation({ actions: ['approve_payment'], nonDelegableActions: ['approve_payment'] }),
    );

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'approve_payment' }));
    assert.equal(decision.type, 'non_delegable_action');
  });

  it('5. a revoked ancestor grant returns ancestor_revoked', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant({ status: 'revoked' }));
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'ancestor_revoked');
  });

  it('6. a suspended ancestor grant also returns ancestor_revoked', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant({ status: 'suspended' }));
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'ancestor_revoked');
  });

  it('7. an expired ancestor grant returns ancestor_expired', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant({ expiresAt: '2025-01-01T00:00:00.000Z' }));
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'ancestor_expired');
  });

  it('8. self-issued authority returns self_issuance_detected', () => {
    const { store, verifier } = setUp();
    store.putGrant(
      victorGrant({
        id: 'authority-grant-forged-self',
        issuerActorId: 'actor-pmfreak',
        subjectActorId: 'actor-pmfreak',
        actions: ['approve_payment'],
      }),
    );

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'approve_payment' }));
    assert.equal(decision.type, 'self_issuance_detected');
  });

  it('9. authority crossing an untrusted trust domain returns cross_domain_authority_denied', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant({ trustDomainId: OTHER_DOMAIN }));
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'cross_domain_authority_denied');
  });

  it('cross-domain authority is allowed once the trust domain explicitly opts in', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.acceptCrossDomainAuthority(TRUST_DOMAIN);
    store.putGrant(victorGrant({ trustDomainId: OTHER_DOMAIN }));
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'authority_valid');
  });

  it('10. exceeding the delegation depth returns delegation_depth_exceeded', () => {
    const { store, verifier } = setUp();
    store.registerRootIssuer(TRUST_DOMAIN, 'actor-datasys');
    store.putGrant(victorGrant());
    store.putDelegation(pmfreakDelegation({ delegationDepth: 2, maxDelegationDepth: 1 }));

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'delegation_depth_exceeded');
  });

  it('an unregistered root issuer is rejected as issuer_not_authorized', () => {
    const { store, verifier } = setUp();
    // No registerRootIssuer call: Datasys is not a recognized root issuer for this trust domain.
    store.putGrant(victorGrant());
    store.putDelegation(pmfreakDelegation());

    const decision = verifier.verifyAuthority(request({ actorId: 'actor-pmfreak', action: 'draft_closure_email' }));
    assert.equal(decision.type, 'issuer_not_authorized');
  });
});
