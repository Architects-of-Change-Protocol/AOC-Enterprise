import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalDecision } from '../domain/approval-decision.js';
import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import type { ApproverRule } from '../domain/approver-rule.js';
import { ApprovalStore } from '../services/approval-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const requirement: ApprovalRequirement = {
  id: 'approval-requirement-1',
  type: 'single_approval',
  trustDomainId: TRUST_DOMAIN,
  action: 'send_client_follow_up',
  resourceScope: 'project:1',
  riskLevel: 'high',
  minimumApprovals: 1,
  requiresSegregationOfDuties: true,
  evidenceRequirements: [],
};

const approverRule: ApproverRule = {
  id: 'approver-rule-1',
  trustDomainId: TRUST_DOMAIN,
  actionPattern: 'send_client_follow_up',
  minApprovals: 1,
  requiresDifferentActorFromRequester: true,
  requiresDifferentActorFromBeneficiary: true,
  allowedRiskLevels: ['high', 'critical'],
};

function buildRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'approval-request-1',
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    targetActorId: 'actor-pmfreak',
    action: 'send_client_follow_up',
    resourceScope: 'project:1',
    riskLevel: 'high',
    requirement,
    status: 'pending',
    evidence: [],
    createdAt: NOW,
    ...overrides,
  };
}

function buildDecision(overrides: Partial<ApprovalDecision> = {}): ApprovalDecision {
  return {
    id: 'approval-decision-1',
    approvalRequestId: 'approval-request-1',
    trustDomainId: TRUST_DOMAIN,
    approverActorId: 'actor-victor',
    type: 'approved',
    approved: true,
    reasonCode: 'ALL_APPROVAL_POLICIES_SATISFIED',
    evidenceReviewed: [],
    decidedAt: NOW,
    ...overrides,
  };
}

function buildProof(overrides: Partial<ApprovalProof> = {}): ApprovalProof {
  return {
    id: 'approval-proof-1',
    approvalRequestId: 'approval-request-1',
    approvalDecisionId: 'approval-decision-1',
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    approverActorId: 'actor-victor',
    action: 'send_client_follow_up',
    resourceScope: 'project:1',
    approved: true,
    status: 'valid',
    evidenceHashes: [],
    proofHash: 'hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

describe('ApprovalStore', () => {
  it('1. can store and retrieve ApprovalRequirement', () => {
    const store = new ApprovalStore();
    store.putRequirement(requirement);
    assert.deepEqual(store.getRequirement(requirement.id), requirement);
  });

  it('2. can store and retrieve ApproverRule', () => {
    const store = new ApprovalStore();
    store.putApproverRule(approverRule);
    assert.deepEqual(store.getApproverRule(approverRule.id), approverRule);
  });

  it('3. can store and retrieve ApprovalRequest', () => {
    const store = new ApprovalStore();
    const request = buildRequest();
    store.putRequest(request);
    assert.deepEqual(store.getRequest(request.id), request);
  });

  it('4. can store and retrieve ApprovalDecision', () => {
    const store = new ApprovalStore();
    const decision = buildDecision();
    store.putDecision(decision);
    assert.deepEqual(store.getDecision(decision.id), decision);
  });

  it('5. can store and retrieve ApprovalProof', () => {
    const store = new ApprovalStore();
    const proof = buildProof();
    store.putProof(proof);
    assert.deepEqual(store.getProof(proof.id), proof);
  });

  it('6. can query pending ApprovalRequests', () => {
    const store = new ApprovalStore();
    store.putRequest(buildRequest({ id: 'req-pending', status: 'pending' }));
    store.putRequest(buildRequest({ id: 'req-approved', status: 'approved' }));
    const pending = store.getPendingRequests();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.id, 'req-pending');
  });

  it('7. can query ApprovalRequests by trustDomainId', () => {
    const store = new ApprovalStore();
    store.putRequest(buildRequest({ id: 'req-a', trustDomainId: 'domain-a' }));
    store.putRequest(buildRequest({ id: 'req-b', trustDomainId: 'domain-b' }));
    const results = store.getRequestsByTrustDomain('domain-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'req-a');
  });

  it('8. can query ApprovalRequests by actionRequestId', () => {
    const store = new ApprovalStore();
    store.putRequest(buildRequest({ id: 'req-a', actionRequestId: 'action-a' }));
    store.putRequest(buildRequest({ id: 'req-b', actionRequestId: 'action-b' }));
    const results = store.getRequestsByActionRequestId('action-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'req-a');
  });

  it('9. can query ApprovalDecisions by approvalRequestId', () => {
    const store = new ApprovalStore();
    store.putDecision(buildDecision({ id: 'dec-a', approvalRequestId: 'req-a' }));
    store.putDecision(buildDecision({ id: 'dec-b', approvalRequestId: 'req-b' }));
    const results = store.getDecisionsByRequestId('req-a');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'dec-a');
  });

  it('10. can query ApprovalDecisions by approverActorId', () => {
    const store = new ApprovalStore();
    store.putDecision(buildDecision({ id: 'dec-a', approverActorId: 'actor-victor' }));
    store.putDecision(buildDecision({ id: 'dec-b', approverActorId: 'actor-finance' }));
    const results = store.getDecisionsByApproverActorId('actor-victor');
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, 'dec-a');
  });

  it('11. can query ApprovalProof by approvalDecisionId', () => {
    const store = new ApprovalStore();
    const proof = buildProof({ approvalDecisionId: 'dec-a' });
    store.putProof(proof);
    assert.deepEqual(store.getProofByDecisionId('dec-a'), proof);
    assert.equal(store.getProofByDecisionId('dec-nonexistent'), undefined);
  });

  it('12. can update ApprovalRequest status', () => {
    const store = new ApprovalStore();
    store.putRequest(buildRequest());
    const updated = store.updateRequestStatus('approval-request-1', 'approved');
    assert.equal(updated.status, 'approved');
    assert.equal(store.getRequest('approval-request-1')?.status, 'approved');
  });

  it('13. can update ApprovalProof status', () => {
    const store = new ApprovalStore();
    store.putProof(buildProof());
    const updated = store.updateProofStatus('approval-proof-1', 'revoked', { revokedAt: NOW });
    assert.equal(updated.status, 'revoked');
    assert.equal(updated.revokedAt, NOW);
  });

  it('14. can retrieve ApproverRules by trustDomainId', () => {
    const store = new ApprovalStore();
    store.putApproverRule(approverRule);
    store.putApproverRule({ ...approverRule, id: 'approver-rule-2', trustDomainId: 'other-domain' });
    const results = store.getApproverRulesByTrustDomain(TRUST_DOMAIN);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, approverRule.id);
  });
});
