import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApprovalEventType } from '../domain/approval-event.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalLedger } from '../services/approval-ledger.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-1';

const ALL_EVENT_TYPES: readonly ApprovalEventType[] = [
  'approval_requested',
  'approvers_resolved',
  'approval_approved',
  'approval_rejected',
  'approval_changes_requested',
  'approval_escalated',
  'approval_expired',
  'approval_revoked',
  'approval_proof_created',
  'approval_verified',
  'approval_verification_failed',
];

function setUp() {
  const ctx = createApprovalRuntimeContext(NOW);
  return new ApprovalLedger(ctx);
}

describe('ApprovalLedger', () => {
  for (const [index, type] of ALL_EVENT_TYPES.entries()) {
    it(`${index + 1}. records ${type} event`, () => {
      const ledger = setUp();
      const event = ledger.recordEvent({ type, trustDomainId: TRUST_DOMAIN, approvalRequestId: 'approval-request-1', payload: {} });
      assert.equal(event.type, type);
      assert.equal(ledger.getEventTrail().length, 1);
    });
  }

  it('12. event hash is deterministic', () => {
    const ledgerA = setUp();
    const ledgerB = setUp();
    const eventA = ledgerA.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'approval-request-1', payload: { action: 'x' } });
    const eventB = ledgerB.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'approval-request-1', payload: { action: 'x' } });
    assert.equal(eventA.eventHash, eventB.eventHash);
  });

  it('13. ledger maintains previousHash/eventHash chain', () => {
    const ledger = setUp();
    const first = ledger.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'approval-request-1', payload: {} });
    const second = ledger.recordEvent({ type: 'approvers_resolved', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'approval-request-1', payload: {} });
    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.eventHash);
  });

  it('14. can retrieve trail by ApprovalRequestId', () => {
    const ledger = setUp();
    ledger.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'req-a', payload: {} });
    ledger.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'req-b', payload: {} });
    const trail = ledger.getTrailByRequestId('req-a');
    assert.equal(trail.length, 1);
    assert.equal(trail[0]?.approvalRequestId, 'req-a');
  });

  it('15. can retrieve events by trustDomainId', () => {
    const ledger = setUp();
    ledger.recordEvent({ type: 'approval_requested', trustDomainId: 'domain-a', approvalRequestId: 'req-a', payload: {} });
    ledger.recordEvent({ type: 'approval_requested', trustDomainId: 'domain-b', approvalRequestId: 'req-b', payload: {} });
    const events = ledger.getEventTrail({ trustDomainId: 'domain-a' });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.trustDomainId, 'domain-a');
  });

  it('16. changing event payload changes eventHash', () => {
    const ledgerA = setUp();
    const eventA = ledgerA.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'req-a', payload: { action: 'x' } });
    const ledgerB = setUp();
    const eventB = ledgerB.recordEvent({ type: 'approval_requested', trustDomainId: TRUST_DOMAIN, approvalRequestId: 'req-a', payload: { action: 'y' } });
    assert.notEqual(eventA.eventHash, eventB.eventHash);
  });
});
