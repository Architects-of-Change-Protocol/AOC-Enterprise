import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthorityChain } from '../domain/authority-chain.js';
import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import { AuthorityProofService } from '../services/authority-proof-service.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const grant: AuthorityGrant = {
  id: 'authority-grant-victor',
  issuerActorId: 'actor-datasys',
  subjectActorId: 'actor-victor',
  trustDomainId: TRUST_DOMAIN,
  capability: 'project_closure.management',
  actions: ['draft_closure_email'],
  resourceScopes: ['project:HMP-14665'],
  canDelegate: true,
  status: 'active',
  issuedAt: NOW,
};

const delegation: DelegationGrant = {
  id: 'delegation-grant-pmfreak',
  delegatorActorId: 'actor-victor',
  delegateActorId: 'actor-pmfreak',
  principalActorId: 'actor-victor',
  trustDomainId: TRUST_DOMAIN,
  sourceAuthorityGrantId: grant.id,
  capability: 'project_closure.drafting',
  actions: ['draft_closure_email'],
  resourceScopes: ['project:HMP-14665'],
  delegationDepth: 1,
  canRedelegate: false,
  status: 'active',
  issuedAt: NOW,
};

function chain(overrides: Partial<AuthorityChain> = {}): AuthorityChain {
  return {
    id: 'authority-chain-1',
    requestId: 'chain-request-1',
    trustDomainId: TRUST_DOMAIN,
    actorId: 'actor-pmfreak',
    grants: [grant],
    delegations: [delegation],
    rootIssuerActorId: 'actor-datasys',
    terminalActorId: 'actor-pmfreak',
    depth: 1,
    status: 'valid',
    createdAt: NOW,
    ...overrides,
  };
}

describe('AuthorityProofService', () => {
  it('1. proof hash is deterministic', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const proof = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.equal(proof.proofHash.length, 64);
  });

  it('2. same inputs produce the same proof hash', () => {
    const serviceA = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const serviceB = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const input = {
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid' as const,
      valid: true,
    };
    const proofA = serviceA.createProof(input);
    const proofB = serviceB.createProof(input);
    assert.equal(proofA.proofHash, proofB.proofHash);
    assert.equal(proofA.chainHash, proofB.chainHash);
  });

  it('3. changing a grant changes the chain hash', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const base = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    const changed = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-2',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain({ grants: [{ ...grant, status: 'revoked' }] }),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.notEqual(base.chainHash, changed.chainHash);
  });

  it('4. changing a delegation changes the chain hash', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const base = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    const changed = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-2',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain({ delegations: [{ ...delegation, status: 'suspended' }] }),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.notEqual(base.chainHash, changed.chainHash);
  });

  it('5. proof includes evaluatedGrantIds', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const proof = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.deepEqual(proof.evaluatedGrantIds, [grant.id]);
  });

  it('6. proof includes evaluatedDelegationIds', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const proof = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.deepEqual(proof.evaluatedDelegationIds, [delegation.id]);
  });

  it('7. proof links to its authorityDecisionId', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const proof = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-42',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.equal(proof.authorityDecisionId, 'authority-decision-42');
  });

  it('8. the proof ledger maintains a previousHash / proofHash chain', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const first = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    const second = service.createProof({
      requestId: 'chain-request-2',
      authorityDecisionId: 'authority-decision-2',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.proofHash);
  });

  it('9. a proof can be exported by authorityDecisionId', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const created = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain(),
      decisionType: 'authority_valid',
      valid: true,
    });
    assert.deepEqual(service.getProofByDecisionId('authority-decision-1'), created);
    assert.equal(service.getProofByDecisionId('missing'), undefined);
  });

  it('10. proof marks valid false for an invalid authority decision', () => {
    const service = new AuthorityProofService(createAuthorityRuntimeContext(NOW));
    const proof = service.createProof({
      requestId: 'chain-request-1',
      authorityDecisionId: 'authority-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actorId: 'actor-pmfreak',
      chain: chain({ status: 'invalid', grants: [], delegations: [] }),
      decisionType: 'authority_missing',
      valid: false,
    });
    assert.equal(proof.valid, false);
    assert.equal(proof.decisionType, 'authority_missing');
  });
});
