import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { SideEffectLedger } from '../services/side-effect-ledger.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  const ledger = new EnforcementLedger(ctx, store);
  return { store, ledger, sideEffectLedger: new SideEffectLedger(ctx, store, ledger) };
}

const INTENT = { id: 'intent-1', action: 'draft_closure_email', resourceScope: 'project:1', riskLevel: 'medium' as const, sideEffectType: 'write' as const };

describe('SideEffectLedger', () => {
  it('1. records a planned side effect', () => {
    const { sideEffectLedger } = setUp();
    const descriptor = sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    assert.equal(descriptor.status, 'planned');
  });

  it('2. records a blocked side effect', () => {
    const { sideEffectLedger } = setUp();
    const descriptor = sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    const blocked = sideEffectLedger.markBlocked(descriptor.id, 'td1', 'actor-1');
    assert.equal(blocked?.status, 'blocked');
  });

  it('3. records an executed side effect', () => {
    const { sideEffectLedger } = setUp();
    const descriptor = sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    const executed = sideEffectLedger.markExecuted(descriptor.id, 'td1', 'actor-1');
    assert.equal(executed?.status, 'executed');
    assert.ok(executed?.executedAt);
  });

  it('4. records a failed side effect', () => {
    const { sideEffectLedger } = setUp();
    const descriptor = sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    const failed = sideEffectLedger.markFailed(descriptor.id);
    assert.equal(failed?.status, 'failed');
    assert.ok(failed?.failedAt);
  });

  it('5. retrieves the side effect trail by request', () => {
    const { sideEffectLedger } = setUp();
    sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    sideEffectLedger.planSideEffect({ enforcementRequestId: 'r2', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    assert.equal(sideEffectLedger.getTrailByRequest('r1').length, 1);
  });

  it('6. a blocked request keeps its side effects at status blocked', () => {
    const { sideEffectLedger } = setUp();
    const descriptor = sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    sideEffectLedger.markBlocked(descriptor.id, 'td1', 'actor-1');
    const trail = sideEffectLedger.getTrailByRequest('r1');
    assert.equal(trail[0]?.status, 'blocked');
  });

  it('7. a dry-run request never marks side effects executed -- it marks them skipped', () => {
    const { sideEffectLedger } = setUp();
    const descriptor = sideEffectLedger.planSideEffect({ enforcementRequestId: 'r1', trustDomainId: 'td1', actorId: 'actor-1', intent: INTENT });
    const skipped = sideEffectLedger.markSkipped(descriptor.id);
    assert.equal(skipped?.status, 'skipped');
  });
});
