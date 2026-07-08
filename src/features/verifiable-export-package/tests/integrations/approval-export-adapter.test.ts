import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapApprovalRequestToItem, mapApprovalDecisionToItem, mapApprovalProofToItem } from '../../integrations/approval-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { ApprovalRequest } from '../../../approval-runtime/domain/approval-request.js';
import type { ApprovalDecision } from '../../../approval-runtime/domain/approval-decision.js';
import type { ApprovalProof } from '../../../approval-runtime/domain/approval-proof.js';
import type { ApprovalRequirement } from '../../../approval-runtime/domain/approval-requirement.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeRequirement(overrides: Partial<ApprovalRequirement> = {}): ApprovalRequirement {
  return {
    id: 'approval-requirement-1',
    type: 'single_approval',
    trustDomainId: 'trust-domain-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    riskLevel: 'high',
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    evidenceRequirements: [],
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'approval-request-1',
    trustDomainId: 'trust-domain-1',
    actionRequestId: 'action-request-1',
    requestedByActorId: 'agent-1',
    targetActorId: 'approver-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    riskLevel: 'high',
    requirement: makeRequirement(),
    status: 'pending',
    evidence: [],
    createdAt: NOW,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<ApprovalDecision> = {}): ApprovalDecision {
  return {
    id: 'approval-decision-1',
    approvalRequestId: 'approval-request-1',
    trustDomainId: 'trust-domain-1',
    approverActorId: 'approver-1',
    type: 'approved',
    approved: true,
    reasonCode: 'APPROVED',
    evidenceReviewed: [],
    decidedAt: NOW,
    ...overrides,
  };
}

function makeProof(overrides: Partial<ApprovalProof> = {}): ApprovalProof {
  return {
    id: 'approval-proof-1',
    approvalRequestId: 'approval-request-1',
    approvalDecisionId: 'approval-decision-1',
    trustDomainId: 'trust-domain-1',
    actionRequestId: 'action-request-1',
    requestedByActorId: 'agent-1',
    approverActorId: 'approver-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    approved: true,
    status: 'valid',
    evidenceHashes: ['evidence-hash-1'],
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

describe('approval-export-adapter', () => {
  it('1. mapApprovalRequestToItem maps an ApprovalRequest to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const request = makeRequest();
    const item = mapApprovalRequestToItem(ctx, request);

    assert.equal(item.type, 'approval_request');
    assert.equal(item.sourceModule, 'approval_runtime');
    assert.equal(item.sourceId, request.id);
    assert.equal(item.payload.action, request.action);
    assert.equal(item.payload.requestedByActorId, request.requestedByActorId);
  });

  it('2. mapApprovalDecisionToItem preserves approverActorId and approved=true verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision();
    const item = mapApprovalDecisionToItem(ctx, decision);

    assert.equal(item.type, 'approval_decision');
    assert.equal(item.sourceModule, 'approval_runtime');
    assert.equal(item.sourceId, decision.id);
    assert.equal(item.payload.approverActorId, decision.approverActorId);
    assert.equal(item.payload.approved, true);
  });

  it('3. mapApprovalDecisionToItem does not fake human review: an approved=false decision is never flipped to true', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision({ type: 'rejected', approved: false, reasonCode: 'REJECTED_HIGH_RISK', reason: 'Insufficient evidence for high-risk payment.' });
    const item = mapApprovalDecisionToItem(ctx, decision);

    assert.equal(item.payload.approved, false);
    assert.equal(item.payload.type, 'rejected');
    assert.equal(item.payload.reasonCode, 'REJECTED_HIGH_RISK');
  });

  it('4. mapApprovalProofToItem preserves evidenceHashes and proofHash verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ evidenceHashes: ['hash-a', 'hash-b'], proofHash: 'proof-hash-xyz' });
    const item = mapApprovalProofToItem(ctx, proof);

    assert.equal(item.type, 'approval_proof');
    assert.equal(item.sourceModule, 'approval_runtime');
    assert.equal(item.sourceId, proof.id);
    assert.deepEqual(item.payload.evidenceHashes, ['hash-a', 'hash-b']);
    assert.equal(item.payload.proofHash, 'proof-hash-xyz');
  });

  it('5. mapApprovalDecisionToItem never fabricates a request that was not actually raised -- only fields present on the literal decision are echoed', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision({ approved: false, reasonCode: 'REJECTED' });
    const item = mapApprovalDecisionToItem(ctx, decision);

    assert.equal(item.payload.approved, false);
    assert.equal('reason' in decision, false);
    assert.equal(item.payload.reason, undefined);
  });
});
