import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementRequestService } from '../services/enforcement-request-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { SideEffectLedger } from '../services/side-effect-ledger.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  const ledger = new EnforcementLedger(ctx, store);
  const sideEffectLedger = new SideEffectLedger(ctx, store, ledger);
  const requestService = new EnforcementRequestService(ctx, store, ledger, sideEffectLedger);
  return { ctx, store, ledger, sideEffectLedger, requestService };
}

function baseInput() {
  return {
    mode: 'execute' as const,
    trustDomainId: 'trust-domain-datasys-agent-republic',
    actorId: 'actor-pmfreak-closure-agent',
    action: 'draft_closure_email',
    resourceScope: 'project:HMP-14665',
    target: { id: 'target-1', type: 'tool_call' as const, name: 'draft_closure_email' },
    intent: { id: 'intent-1', action: 'draft_closure_email', resourceScope: 'project:HMP-14665', riskLevel: 'medium' as const, sideEffectType: 'write' as const },
  };
}

describe('EnforcementRequestService', () => {
  it('1. can create an EnforcementRequest', () => {
    const { requestService } = setUp();
    const request = requestService.createEnforcementRequest(baseInput());
    assert.equal(request.status, 'submitted');
    assert.equal(request.action, 'draft_closure_email');
  });

  it('2. can retrieve an EnforcementRequest', () => {
    const { requestService } = setUp();
    const request = requestService.createEnforcementRequest(baseInput());
    assert.deepEqual(requestService.getEnforcementRequest(request.id), request);
  });

  it('3. can expire an EnforcementRequest', () => {
    const { requestService } = setUp();
    const request = requestService.createEnforcementRequest(baseInput());
    const expired = requestService.expireEnforcementRequest(request.id);
    assert.equal(expired?.status, 'blocked');
  });

  it('4. can cancel an EnforcementRequest', () => {
    const { requestService } = setUp();
    const request = requestService.createEnforcementRequest(baseInput());
    const cancelled = requestService.cancelEnforcementRequest(request.id);
    assert.equal(cancelled?.status, 'cancelled');
  });

  it('5. creates a SideEffectDescriptor from the ExecutionIntent', () => {
    const { requestService } = setUp();
    const request = requestService.createEnforcementRequest(baseInput());
    assert.equal(request.sideEffects.length, 1);
    assert.equal(request.sideEffects[0]?.type, 'write');
    assert.equal(request.sideEffects[0]?.status, 'planned');
  });

  it('6. records an enforcement_requested event', () => {
    const { requestService, ledger } = setUp();
    const request = requestService.createEnforcementRequest(baseInput());
    const trail = ledger.getTrailByRequest(request.id);
    assert.ok(trail.some((event) => event.type === 'enforcement_requested'));
  });

  it('7. uses the injected clock and ID generator deterministically', () => {
    const ctxA = createEnforcementRuntimeContext(NOW);
    const storeA = new EnforcementStore();
    const ledgerA = new EnforcementLedger(ctxA, storeA);
    const sideEffectLedgerA = new SideEffectLedger(ctxA, storeA, ledgerA);
    const serviceA = new EnforcementRequestService(ctxA, storeA, ledgerA, sideEffectLedgerA);

    const ctxB = createEnforcementRuntimeContext(NOW);
    const storeB = new EnforcementStore();
    const ledgerB = new EnforcementLedger(ctxB, storeB);
    const sideEffectLedgerB = new SideEffectLedger(ctxB, storeB, ledgerB);
    const serviceB = new EnforcementRequestService(ctxB, storeB, ledgerB, sideEffectLedgerB);

    const requestA = serviceA.createEnforcementRequest(baseInput());
    const requestB = serviceB.createEnforcementRequest(baseInput());
    assert.equal(requestA.id, requestB.id);
    assert.equal(requestA.submittedAt, requestB.submittedAt);
  });
});
