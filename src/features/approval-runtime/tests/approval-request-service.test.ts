import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalLedger } from '../services/approval-ledger.js';
import { ApprovalRequestService, type CreateApprovalRequestInput } from '../services/approval-request-service.js';
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

function buildInput(overrides: Partial<CreateApprovalRequestInput> = {}): CreateApprovalRequestInput {
  return {
    trustDomainId: TRUST_DOMAIN,
    actionRequestId: 'action-request-1',
    requestedByActorId: 'actor-pmfreak',
    targetActorId: 'actor-pmfreak',
    action: 'send_client_follow_up',
    resourceScope: 'project:1',
    riskLevel: 'high',
    requirement,
    evidence: [],
    ...overrides,
  };
}

function setUp() {
  const ctx = createApprovalRuntimeContext(NOW);
  const store = new ApprovalStore();
  const ledger = new ApprovalLedger(ctx);
  const service = new ApprovalRequestService(ctx, store, ledger);
  return { ctx, store, ledger, service };
}

describe('ApprovalRequestService', () => {
  it('1. can create ApprovalRequest', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    assert.equal(request.status, 'pending');
    assert.equal(request.action, 'send_client_follow_up');
    assert.ok(request.id.startsWith('approval-request-'));
  });

  it('2. can retrieve ApprovalRequest', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    assert.deepEqual(service.getApprovalRequest(request.id), request);
  });

  it('3. can list pending ApprovalRequests', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const pending = service.listPendingApprovalRequests();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.id, request.id);
  });

  it('4. can mark ApprovalRequest approved', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const approved = service.markApproved(request.id);
    assert.equal(approved.status, 'approved');
  });

  it('5. can mark ApprovalRequest rejected', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const rejected = service.markRejected(request.id);
    assert.equal(rejected.status, 'rejected');
  });

  it('6. can mark ApprovalRequest expired', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const expired = service.markExpired(request.id);
    assert.equal(expired.status, 'expired');
  });

  it('7. can mark ApprovalRequest revoked', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const revoked = service.markRevoked(request.id);
    assert.equal(revoked.status, 'revoked');
  });

  it('8. can cancel ApprovalRequest', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const cancelled = service.cancelApprovalRequest(request.id);
    assert.equal(cancelled.status, 'cancelled');
  });

  it('9. cannot approve cancelled request', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    service.cancelApprovalRequest(request.id);
    assert.throws(() => service.markApproved(request.id));
  });

  it('10. cannot approve revoked request', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    service.markRevoked(request.id);
    assert.throws(() => service.markApproved(request.id));
  });

  it('11. cannot approve expired request', () => {
    const { service } = setUp();
    const request = service.createApprovalRequest(buildInput());
    service.markExpired(request.id);
    assert.throws(() => service.markApproved(request.id));
  });

  it('12. records approval_requested event', () => {
    const { service, ledger } = setUp();
    const request = service.createApprovalRequest(buildInput());
    const events = ledger.getEventTrail({ approvalRequestId: request.id });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'approval_requested');
  });
});
