import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalEvidenceArtifact } from '../domain/approval-evidence.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalProofService, type CreateApprovalProofInput } from '../services/approval-proof-service.js';
import { ApprovalStore } from '../services/approval-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const evidence: readonly ApprovalEvidenceArtifact[] = [
  { id: 'evidence-1', type: 'email_draft', providedByActorId: 'actor-pmfreak', description: 'Draft', createdAt: NOW },
];

function buildInput(overrides: Partial<CreateApprovalProofInput> = {}): CreateApprovalProofInput {
  return {
    approvalRequestId: 'approval-request-1',
    approvalDecisionId: 'approval-decision-1',
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    approverActorId: 'actor-victor',
    action: 'send_client_follow_up',
    resourceScope: 'project:HMP-14665',
    approved: true,
    evidence,
    ...overrides,
  };
}

function setUp() {
  const ctx = createApprovalRuntimeContext(NOW);
  const store = new ApprovalStore();
  const service = new ApprovalProofService(ctx, store);
  return { ctx, store, service };
}

describe('ApprovalProofService', () => {
  it('1. ApprovalProof hash is deterministic', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput());
    assert.equal(typeof proof.proofHash, 'string');
    assert.ok(proof.proofHash.length > 0);
  });

  it('2. same inputs produce same proof hash', () => {
    const { service: serviceA } = setUp();
    const { service: serviceB } = setUp();
    const proofA = serviceA.createProof(buildInput());
    const proofB = serviceB.createProof(buildInput());
    assert.equal(proofA.proofHash, proofB.proofHash);
  });

  it('3. changing approver changes proof hash', () => {
    const { service } = setUp();
    const proofA = service.createProof(buildInput());
    const { service: serviceB } = setUp();
    const proofB = serviceB.createProof(buildInput({ approverActorId: 'actor-finance-approver' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('4. changing evidence changes proof hash', () => {
    const { service } = setUp();
    const proofA = service.createProof(buildInput());
    const { service: serviceB } = setUp();
    const proofB = serviceB.createProof(
      buildInput({ evidence: [{ id: 'evidence-2', type: 'project_context', providedByActorId: 'actor-pmfreak', createdAt: NOW }] }),
    );
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('5. changing decision changes proof hash', () => {
    const { service } = setUp();
    const proofA = service.createProof(buildInput());
    const { service: serviceB } = setUp();
    const proofB = serviceB.createProof(buildInput({ approved: false }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('6. proof includes evidence hashes', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput());
    assert.equal(proof.evidenceHashes.length, 1);
  });

  it('7. proof includes authorityProofId when available', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput({ authorityDecisionId: 'authority-decision-1', authorityProofId: 'authority-proof-1' }));
    assert.equal(proof.authorityProofId, 'authority-proof-1');
    assert.equal(proof.authorityDecisionId, 'authority-decision-1');
  });

  it('8. proof includes actionRequestId', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput());
    assert.equal(proof.actionRequestId, 'action-request-1');
  });

  it('9. proof ledger maintains previousHash/proofHash chain', () => {
    const { service } = setUp();
    const first = service.createProof(buildInput());
    const second = service.createProof(buildInput({ approvalDecisionId: 'approval-decision-2', approverActorId: 'actor-finance-approver' }));
    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.proofHash);
  });

  it('10. proof can be exported by approvalDecisionId', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput());
    assert.deepEqual(service.getProofByDecisionId('approval-decision-1'), proof);
  });

  it('11. revoked proof cannot verify as valid', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput());
    service.revokeApprovalProof(proof.id, 'actor-datasys', 'Compliance request.');
    const verification = service.verifyApprovalProof(proof.id, NOW);
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'APPROVAL_REVOKED');
  });

  it('12. expired proof cannot verify as valid', () => {
    const { service } = setUp();
    const proof = service.createProof(buildInput({ expiresAt: '2026-01-01T00:01:00.000Z' }));
    const verification = service.verifyApprovalProof(proof.id, '2026-01-01T00:02:00.000Z');
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'APPROVAL_EXPIRED');
  });
});
