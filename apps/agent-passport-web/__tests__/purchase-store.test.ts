import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPendingPurchase, markPurchaseComplete, getPurchase, canEnrollWithPurchase } from '../src/lib/purchase-store';

describe('purchase store', () => {
  it('createPendingPurchase creates a pending purchase', () => {
    const p = createPendingPurchase('agent_passport_single');
    assert.equal(p.status, 'pending');
    assert.equal(p.tier, 'agent_passport_single');
    assert.ok(p.sessionId.startsWith('mvp-session-'));
  });

  it('getPurchase retrieves the purchase', () => {
    const p = createPendingPurchase('governed_agent');
    const retrieved = getPurchase(p.sessionId);
    assert.ok(retrieved);
    assert.equal(retrieved.sessionId, p.sessionId);
  });

  it('canEnrollWithPurchase returns false for pending purchase', () => {
    const p = createPendingPurchase('agent_passport_single');
    assert.ok(!canEnrollWithPurchase(p.sessionId));
  });

  it('markPurchaseComplete and canEnrollWithPurchase returns true', () => {
    const p = createPendingPurchase('agent_passport_single');
    markPurchaseComplete(p.sessionId, p.tier);
    assert.ok(canEnrollWithPurchase(p.sessionId));
  });

  it('canEnrollWithPurchase returns false for unknown session', () => {
    assert.ok(!canEnrollWithPurchase('unknown-session-id'));
  });
});
