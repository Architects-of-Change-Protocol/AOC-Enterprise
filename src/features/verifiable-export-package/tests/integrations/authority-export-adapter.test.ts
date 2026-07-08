import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapAuthorityGrantToItem, mapDelegationGrantToItem, mapAuthorityProofToItem } from '../../integrations/authority-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { AuthorityGrant } from '../../../authority-graph/domain/authority-grant.js';
import type { DelegationGrant } from '../../../authority-graph/domain/delegation-grant.js';
import type { AuthorityProof } from '../../../authority-graph/domain/authority-proof.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeGrant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    id: 'authority-grant-1',
    issuerActorId: 'actor-issuer-1',
    subjectActorId: 'actor-subject-1',
    trustDomainId: 'trust-domain-1',
    capability: 'project_manager',
    actions: ['approve', 'read'],
    resourceScopes: ['project:HMP-14665'],
    canDelegate: true,
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

function makeDelegation(overrides: Partial<DelegationGrant> = {}): DelegationGrant {
  return {
    id: 'delegation-grant-1',
    delegatorActorId: 'actor-subject-1',
    delegateActorId: 'agent-closure-1',
    principalActorId: 'actor-subject-1',
    trustDomainId: 'trust-domain-1',
    sourceAuthorityGrantId: 'authority-grant-1',
    capability: 'draft_closure_email',
    actions: ['draft'],
    resourceScopes: ['project:HMP-14665'],
    delegationDepth: 1,
    canRedelegate: false,
    status: 'active',
    issuedAt: NOW,
    ...overrides,
  };
}

function makeProof(overrides: Partial<AuthorityProof> = {}): AuthorityProof {
  return {
    id: 'authority-proof-1',
    requestId: 'request-1',
    authorityDecisionId: 'authority-decision-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-subject-1',
    chainHash: 'chain-hash-1',
    evaluatedGrantIds: ['authority-grant-1'],
    evaluatedDelegationIds: ['delegation-grant-1'],
    decisionType: 'authority_valid',
    valid: true,
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

describe('authority-export-adapter', () => {
  it('1. mapAuthorityGrantToItem maps an AuthorityGrant to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const grant = makeGrant();
    const item = mapAuthorityGrantToItem(ctx, grant);

    assert.equal(item.type, 'authority_grant');
    assert.equal(item.sourceModule, 'authority_graph');
    assert.equal(item.sourceId, grant.id);
    assert.equal(item.payload.capability, grant.capability);
    assert.deepEqual(item.payload.actions, grant.actions);
  });

  it('2. mapDelegationGrantToItem maps a DelegationGrant to an ExportPackageItem, preserving sourceAuthorityGrantId', () => {
    const ctx = createExportRuntimeContext(NOW);
    const delegation = makeDelegation();
    const item = mapDelegationGrantToItem(ctx, delegation);

    assert.equal(item.type, 'authority_delegation');
    assert.equal(item.sourceModule, 'authority_graph');
    assert.equal(item.sourceId, delegation.id);
    assert.equal(item.payload.sourceAuthorityGrantId, 'authority-grant-1');
  });

  it('3. mapAuthorityProofToItem maps an AuthorityProof to an ExportPackageItem, preserving proofHash and evaluated grant/delegation ids', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof();
    const item = mapAuthorityProofToItem(ctx, proof);

    assert.equal(item.type, 'authority_proof');
    assert.equal(item.sourceModule, 'authority_graph');
    assert.equal(item.sourceId, proof.id);
    assert.equal(item.payload.proofHash, proof.proofHash);
    assert.deepEqual(item.payload.evaluatedGrantIds, proof.evaluatedGrantIds);
    assert.deepEqual(item.payload.evaluatedDelegationIds, proof.evaluatedDelegationIds);
  });

  it('4. mapAuthorityProofToItem preserves an invalid proof verbatim, never flipping it to valid', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ valid: false, decisionType: 'authority_denied' });
    const item = mapAuthorityProofToItem(ctx, proof);

    assert.equal(item.payload.valid, false);
    assert.equal(item.payload.decisionType, 'authority_denied');
  });
});
