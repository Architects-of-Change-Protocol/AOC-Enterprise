import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalLedger } from '../services/approval-ledger.js';
import { ApprovalProofService } from '../services/approval-proof-service.js';
import { ApprovalRequestService } from '../services/approval-request-service.js';
import { ApprovalRevocationService } from '../services/approval-revocation-service.js';
import { ApprovalStore } from '../services/approval-store.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const requirement: ApprovalRequirement = {
  id: 'approval-requirement-1',
  type: 'single_approval',
  trustDomainId: TRUST_DOMAIN,
  action: 'send_client_follow_up',
  resourceScope: 'project:HMP-14665',
  riskLevel: 'high',
  minimumApprovals: 1,
  requiresSegregationOfDuties: false,
  evidenceRequirements: [],
};

function setUp() {
  const ctx = createApprovalRuntimeContext(NOW);
  const store = new ApprovalStore();
  const ledger = new ApprovalLedger(ctx);
  const requestService = new ApprovalRequestService(ctx, store, ledger);
  const proofService = new ApprovalProofService(ctx, store);
  const revocationService = new ApprovalRevocationService(requestService, proofService, ledger);

  const request = requestService.createApprovalRequest({
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    targetActorId: 'actor-pmfreak',
    action: requirement.action,
    resourceScope: requirement.resourceScope,
    riskLevel: requirement.riskLevel,
    requirement,
    evidence: [],
  });

  const proof = proofService.createProof({
    approvalRequestId: request.id,
    approvalDecisionId: 'approval-decision-1',
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    approverActorId: 'actor-victor',
    action: requirement.action,
    resourceScope: requirement.resourceScope,
    approved: true,
    evidence: [],
  });

  return { ctx, store, ledger, requestService, proofService, revocationService, request, proof };
}

describe('ApprovalRevocationService', () => {
  it('1. revokes ApprovalRequest', () => {
    const { revocationService, request } = setUp();
    const revoked = revocationService.revokeApprovalRequest(request.id, 'actor-datasys', 'Compliance hold.');
    assert.equal(revoked.status, 'revoked');
  });

  it('2. revokes ApprovalProof', () => {
    const { revocationService, proof } = setUp();
    const revoked = revocationService.revokeApprovalProof(proof.id, 'actor-datasys', 'Compliance hold.');
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.revokedByActorId, 'actor-datasys');
  });

  it('3. records approval_revoked event', () => {
    const { revocationService, ledger, request } = setUp();
    revocationService.revokeApprovalRequest(request.id, 'actor-datasys', 'Compliance hold.');
    const events = ledger.getEventTrail({ approvalRequestId: request.id });
    assert.ok(events.some((event) => event.type === 'approval_revoked'));
  });

  it('4. revoked ApprovalRequest cannot be approved', () => {
    const { revocationService, requestService, request } = setUp();
    revocationService.revokeApprovalRequest(request.id, 'actor-datasys', 'Compliance hold.');
    assert.throws(() => requestService.markApproved(request.id));
  });

  it('5. revoked ApprovalProof cannot verify as valid', () => {
    const { revocationService, proofService, proof } = setUp();
    revocationService.revokeApprovalProof(proof.id, 'actor-datasys', 'Compliance hold.');
    const verification = proofService.verifyApprovalProof(proof.id, NOW);
    assert.equal(verification.valid, false);
    assert.equal(verification.reasonCode, 'APPROVAL_REVOKED');
  });

  it('6. historical approval events remain in ledger', () => {
    const { revocationService, ledger, request } = setUp();
    const beforeCount = ledger.getEventTrail({ approvalRequestId: request.id }).length;
    assert.equal(beforeCount, 1); // approval_requested
    revocationService.revokeApprovalRequest(request.id, 'actor-datasys', 'Compliance hold.');
    const events = ledger.getEventTrail({ approvalRequestId: request.id });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.type, 'approval_requested');
    assert.equal(events[1]?.type, 'approval_revoked');
  });
});
