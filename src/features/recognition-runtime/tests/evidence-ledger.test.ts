import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EvidenceLedger } from '../services/evidence-ledger.js';
import { createRuntimeContext } from '../runtime/runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

describe('EvidenceLedger', () => {
  it('produces a hash-chained audit trail', () => {
    const ledger = new EvidenceLedger(createRuntimeContext(NOW));

    const first = ledger.recordAuditEvent({
      eventType: 'actor_registered',
      actorId: 'actor-1',
      trustDomainId: 'trust-domain-1',
      payload: { note: 'first event' },
    });
    const second = ledger.recordAuditEvent({
      eventType: 'passport_issued',
      actorId: 'actor-1',
      trustDomainId: 'trust-domain-1',
      payload: { note: 'second event' },
    });

    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.eventHash);
    assert.notEqual(first.eventHash, second.eventHash);
    assert.equal(first.eventHash.length, 64);
  });

  it('produces the exact same hash chain given the same inputs (deterministic)', () => {
    function record() {
      const ledger = new EvidenceLedger(createRuntimeContext(NOW));
      ledger.recordAuditEvent({ eventType: 'actor_registered', actorId: 'actor-1', trustDomainId: 'trust-domain-1', payload: { a: 1, b: 2 } });
      return ledger.getAuditTrail();
    }

    const trailA = record();
    const trailB = record();
    assert.equal(trailA[0]?.eventHash, trailB[0]?.eventHash);
  });

  it('changing the payload changes the resulting hash', () => {
    function record(note: string) {
      const ledger = new EvidenceLedger(createRuntimeContext(NOW));
      return ledger.recordAuditEvent({ eventType: 'actor_registered', actorId: 'actor-1', trustDomainId: 'trust-domain-1', payload: { note } });
    }

    assert.notEqual(record('a').eventHash, record('b').eventHash);
  });

  it('getAuditTrail filters by actorId, trustDomainId and requestId', () => {
    const ledger = new EvidenceLedger(createRuntimeContext(NOW));
    ledger.recordAuditEvent({ eventType: 'recognition_decision', actorId: 'actor-1', trustDomainId: 'trust-domain-1', requestId: 'req-1', payload: {} });
    ledger.recordAuditEvent({ eventType: 'recognition_decision', actorId: 'actor-2', trustDomainId: 'trust-domain-1', requestId: 'req-2', payload: {} });

    assert.equal(ledger.getAuditTrail({ actorId: 'actor-1' }).length, 1);
    assert.equal(ledger.getAuditTrail({ requestId: 'req-2' }).length, 1);
    assert.equal(ledger.getAuditTrail({ trustDomainId: 'trust-domain-1' }).length, 2);
  });

  it('exportActionProof bundles the events for a request with a root hash, or undefined if none exist', () => {
    const ledger = new EvidenceLedger(createRuntimeContext(NOW));
    assert.equal(ledger.exportActionProof('req-unknown'), undefined);

    const event = ledger.recordAuditEvent({
      eventType: 'recognition_decision',
      actorId: 'actor-1',
      trustDomainId: 'trust-domain-1',
      requestId: 'req-1',
      payload: {},
    });

    const proof = ledger.exportActionProof('req-1');
    assert.ok(proof);
    assert.equal(proof?.events.length, 1);
    assert.equal(proof?.rootHash, event.eventHash);
  });
});
