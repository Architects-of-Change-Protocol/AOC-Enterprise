import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementEventType } from '../domain/enforcement-event.js';
import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

const ALL_EVENT_TYPES: readonly EnforcementEventType[] = [
  'enforcement_requested',
  'preflight_started',
  'preflight_passed',
  'preflight_failed',
  'execution_blocked',
  'execution_started',
  'execution_succeeded',
  'execution_failed',
  'duplicate_suppressed',
  'side_effect_planned',
  'side_effect_blocked',
  'side_effect_executed',
  'enforcement_proof_created',
  'enforcement_violation_recorded',
];

function setUp() {
  const store = new EnforcementStore();
  return { store, ledger: new EnforcementLedger(createEnforcementRuntimeContext(NOW), store) };
}

describe('EnforcementLedger', () => {
  for (const [index, type] of ALL_EVENT_TYPES.entries()) {
    it(`${index + 1}. records ${type} events`, () => {
      const { ledger } = setUp();
      const event = ledger.recordEvent({ type, trustDomainId: 'td1', enforcementRequestId: 'r1', actorId: 'actor-1', payload: {} });
      assert.equal(event.type, type);
    });
  }

  it('15. event hash is deterministic', () => {
    const ledgerA = new EnforcementLedger(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const ledgerB = new EnforcementLedger(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const eventA = ledgerA.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r1', payload: { action: 'draft_closure_email' } });
    const eventB = ledgerB.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r1', payload: { action: 'draft_closure_email' } });
    assert.equal(eventA.eventHash, eventB.eventHash);
  });

  it('16. the ledger maintains a previousHash/eventHash chain', () => {
    const { ledger } = setUp();
    const first = ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r1', payload: {} });
    const second = ledger.recordEvent({ type: 'preflight_started', trustDomainId: 'td1', enforcementRequestId: 'r1', payload: {} });
    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.eventHash);
  });

  it('17. can retrieve the trail by EnforcementRequest', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r1', payload: {} });
    ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r2', payload: {} });
    assert.equal(ledger.getTrailByRequest('r1').length, 1);
  });

  it('18. can retrieve events by trustDomain', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r1', payload: {} });
    ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td2', enforcementRequestId: 'r2', payload: {} });
    assert.equal(ledger.getEventsByTrustDomain('td1').length, 1);
  });

  it('19. can retrieve events by actor', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r1', actorId: 'actor-a', payload: {} });
    ledger.recordEvent({ type: 'enforcement_requested', trustDomainId: 'td1', enforcementRequestId: 'r2', actorId: 'actor-b', payload: {} });
    assert.equal(ledger.getEventsByActor('actor-a').length, 1);
  });

  it('20. can retrieve events by decision', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'preflight_passed', trustDomainId: 'td1', enforcementRequestId: 'r1', enforcementDecisionId: 'd1', payload: {} });
    ledger.recordEvent({ type: 'preflight_passed', trustDomainId: 'td1', enforcementRequestId: 'r2', enforcementDecisionId: 'd2', payload: {} });
    assert.equal(ledger.getEventsByDecision('d1').length, 1);
  });

  it('21. can retrieve events by proof', () => {
    const { ledger } = setUp();
    ledger.recordEvent({ type: 'enforcement_proof_created', trustDomainId: 'td1', enforcementRequestId: 'r1', enforcementProofId: 'p1', payload: {} });
    ledger.recordEvent({ type: 'enforcement_proof_created', trustDomainId: 'td1', enforcementRequestId: 'r2', enforcementProofId: 'p2', payload: {} });
    assert.equal(ledger.getEventsByProof('p1').length, 1);
  });
});
