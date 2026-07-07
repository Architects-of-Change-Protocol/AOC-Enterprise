import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import { createManualApprovalClock, createSequentialApprovalIdGenerator, type ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { createStoreApprovalActorRecognitionIntegration } from '../services/approval-actor-recognition-integration.js';
import { ApprovalDecisionService } from '../services/approval-decision-service.js';
import { ApprovalLedger } from '../services/approval-ledger.js';
import { ApprovalProofService } from '../services/approval-proof-service.js';
import { ApprovalRequestService, type CreateApprovalRequestInput } from '../services/approval-request-service.js';
import { ApprovalStore } from '../services/approval-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';
const PROJECT_SCOPE = 'project:HMP-14665';

function requirement(overrides: Partial<ApprovalRequirement> = {}): ApprovalRequirement {
  return {
    id: 'approval-requirement-1',
    type: 'single_approval',
    trustDomainId: TRUST_DOMAIN,
    action: 'send_client_follow_up',
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    evidenceRequirements: [],
    ...overrides,
  };
}

function setUp() {
  const clock = createManualApprovalClock(NOW);
  const ids = createSequentialApprovalIdGenerator();
  const ctx: ApprovalRuntimeContext = { clock, ids };
  const store = new ApprovalStore();
  const ledger = new ApprovalLedger(ctx);
  const requestService = new ApprovalRequestService(ctx, store, ledger);
  const proofService = new ApprovalProofService(ctx, store);
  const recognition = createStoreApprovalActorRecognitionIntegration(store);
  const decisionService = new ApprovalDecisionService(ctx, store, ledger, requestService, proofService, recognition);

  store.registerApproverRecognitionStatus('actor-victor', 'recognized');
  store.registerApproverRecognitionStatus('actor-finance-approver', 'recognized');

  function createRequest(input: Partial<CreateApprovalRequestInput> = {}, req: ApprovalRequirement = requirement()) {
    return requestService.createApprovalRequest({
      trustDomainId: TRUST_DOMAIN,
      actionRequestId: 'action-request-1',
      requestedByActorId: 'actor-pmfreak',
      targetActorId: 'actor-pmfreak',
      action: req.action,
      resourceScope: req.resourceScope,
      riskLevel: req.riskLevel,
      requirement: req,
      evidence: [],
      ...input,
    });
  }

  return { ctx, clock, store, ledger, requestService, proofService, decisionService, createRequest };
}

describe('ApprovalDecisionService', () => {
  it('1. valid approver can approve', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.decision.type, 'approved');
    assert.equal(result.decision.approved, true);
  });

  it('2. valid approver can reject', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.reject({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.decision.type, 'rejected');
    assert.equal(result.request?.status, 'rejected');
  });

  it('3. valid approver can request changes', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.requestChanges({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.decision.type, 'requested_changes');
    assert.equal(result.request?.status, 'pending');
  });

  it('4. valid approver can escalate', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.escalate({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.decision.type, 'escalated');
    assert.equal(result.request?.status, 'pending');
  });

  it('5. invalid approver cannot approve', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-unknown-external-agent' });
    assert.equal(result.decision.type, 'invalid_approver');
    assert.equal(result.decision.approved, false);
  });

  it('6. expired request cannot be approved', () => {
    const { decisionService, createRequest, clock } = setUp();
    const request = createRequest({ expiresAt: '2026-01-01T00:01:00.000Z' });
    clock.advance(2 * 60_000);
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.decision.type, 'expired');
    assert.equal(result.request?.status, 'expired');
  });

  it('7. revoked request cannot be approved', () => {
    const { decisionService, createRequest, requestService } = setUp();
    const request = createRequest();
    requestService.markRevoked(request.id);
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.decision.type, 'revoked');
  });

  it('8. approved request cannot be approved twice unless quorum rules allow multiple decisions', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const first = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(first.request?.status, 'approved');
    const second = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-finance-approver' });
    assert.equal(second.decision.type, 'rejected');
  });

  it('9. decision creates ApprovalProof when approval requirements are satisfied', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.ok(result.proof);
    assert.equal(result.proof?.approved, true);
  });

  it('10. decision records ApprovalEvent', () => {
    const { decisionService, createRequest, ledger } = setUp();
    const request = createRequest();
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    const events = ledger.getEventTrail({ approvalRequestId: request.id });
    const types = events.map((event) => event.type);
    assert.ok(types.includes('approval_approved'));
    assert.ok(types.includes('approval_proof_created'));
    assert.ok(events.some((event) => event.approvalDecisionId === result.decision.id));
  });

  it('11. single approval request becomes approved after valid approval', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest();
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.request?.status, 'approved');
    assert.equal(result.quorumMet, true);
  });

  it('12. dual approval request remains pending after first valid approval', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest({}, requirement({ minimumApprovals: 2 }));
    const result = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(result.request?.status, 'pending');
    assert.equal(result.quorumMet, false);
    assert.equal(result.proof, undefined);
  });

  it('13. dual approval request becomes approved after second distinct valid approval', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest({}, requirement({ minimumApprovals: 2 }));
    decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    const second = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-finance-approver' });
    assert.equal(second.request?.status, 'approved');
    assert.equal(second.quorumMet, true);
    assert.ok(second.proof);
  });

  it('14. duplicate approver does not satisfy quorum twice', () => {
    const { decisionService, createRequest } = setUp();
    const request = createRequest({}, requirement({ minimumApprovals: 2 }));
    decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    const duplicate = decisionService.approve({ approvalRequestId: request.id, approverActorId: 'actor-victor' });
    assert.equal(duplicate.decision.type, 'duplicate_approval');
    assert.equal(duplicate.request?.status, 'pending');
  });
});
