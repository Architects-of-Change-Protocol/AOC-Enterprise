import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import { createManualApprovalClock, createSequentialApprovalIdGenerator, type ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalExpirationService } from '../services/approval-expiration-service.js';
import { ApprovalLedger } from '../services/approval-ledger.js';
import { ApprovalProofService } from '../services/approval-proof-service.js';
import { ApprovalRequestService } from '../services/approval-request-service.js';
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
  const clock = createManualApprovalClock(NOW);
  const ctx: ApprovalRuntimeContext = { clock, ids: createSequentialApprovalIdGenerator() };
  const store = new ApprovalStore();
  const ledger = new ApprovalLedger(ctx);
  const requestService = new ApprovalRequestService(ctx, store, ledger);
  const proofService = new ApprovalProofService(ctx, store);
  const expirationService = new ApprovalExpirationService(ctx, store, requestService, proofService, ledger);
  return { ctx, clock, store, ledger, requestService, proofService, expirationService };
}

describe('ApprovalExpirationService', () => {
  it('1. detects expired ApprovalRequest', () => {
    const { requestService, expirationService, clock } = setUp();
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
      expiresAt: '2026-01-01T00:01:00.000Z',
    });
    clock.advance(2 * 60_000);
    const expired = expirationService.detectExpiredRequests();
    assert.equal(expired.length, 1);
    assert.equal(expired[0]?.id, request.id);
  });

  it('2. marks ApprovalRequest expired', () => {
    const { requestService, expirationService, clock, store } = setUp();
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
      expiresAt: '2026-01-01T00:01:00.000Z',
    });
    clock.advance(2 * 60_000);
    const [expired] = expirationService.expirePendingRequests();
    assert.equal(expired?.status, 'expired');
    assert.equal(store.getRequest(request.id)?.status, 'expired');
  });

  it('3. prevents late approval', () => {
    const { requestService, expirationService, clock } = setUp();
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
      expiresAt: '2026-01-01T00:01:00.000Z',
    });
    clock.advance(2 * 60_000);
    expirationService.expirePendingRequests();
    assert.throws(() => requestService.markApproved(request.id));
  });

  it('4. detects expired ApprovalProof', () => {
    const { proofService, expirationService, clock } = setUp();
    const proof = proofService.createProof({
      approvalRequestId: 'approval-request-1',
      approvalDecisionId: 'approval-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actionRequestId: 'action-request-1',
      requestedByActorId: 'actor-pmfreak',
      approverActorId: 'actor-victor',
      action: requirement.action,
      resourceScope: requirement.resourceScope,
      approved: true,
      evidence: [],
      expiresAt: '2026-01-01T00:01:00.000Z',
    });
    clock.advance(2 * 60_000);
    assert.equal(expirationService.isProofExpired(proof), true);
  });

  it('5. prevents expired ApprovalProof from validating', () => {
    const { proofService, expirationService, clock } = setUp();
    const proof = proofService.createProof({
      approvalRequestId: 'approval-request-1',
      approvalDecisionId: 'approval-decision-1',
      trustDomainId: TRUST_DOMAIN,
      actionRequestId: 'action-request-1',
      requestedByActorId: 'actor-pmfreak',
      approverActorId: 'actor-victor',
      action: requirement.action,
      resourceScope: requirement.resourceScope,
      approved: true,
      evidence: [],
      expiresAt: '2026-01-01T00:01:00.000Z',
    });
    clock.advance(2 * 60_000);
    expirationService.expireProofIfNeeded(proof.id);
    const verification = proofService.verifyApprovalProof(proof.id, clock.now());
    assert.equal(verification.valid, false);
  });

  it('6. uses injected clock only', () => {
    const { requestService, expirationService, clock } = setUp();
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
      expiresAt: '2026-01-01T00:01:00.000Z',
    });
    assert.equal(expirationService.isRequestExpired(request), false);
    clock.set('2026-01-01T00:02:00.000Z');
    assert.equal(expirationService.isRequestExpired(request), true);
  });
});
