import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementEvent } from '../domain/enforcement-event.js';
import type { EnforcementProof } from '../domain/enforcement-proof.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementViolation } from '../domain/enforcement-violation.js';
import type { ExecutionResult } from '../domain/execution-result.js';
import type { SideEffectDescriptor } from '../domain/side-effect.js';
import { EnforcementStore } from '../services/enforcement-store.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildRequest(overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  return {
    id: 'enforcement-request-000001',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'trust-domain-datasys-agent-republic',
    actorId: 'actor-pmfreak-closure-agent',
    action: 'draft_closure_email',
    resourceScope: 'project:HMP-14665',
    target: { id: 'target-1', type: 'tool_call', name: 'draft_closure_email' },
    intent: { id: 'intent-1', action: 'draft_closure_email', resourceScope: 'project:HMP-14665', riskLevel: 'medium', sideEffectType: 'write' },
    sideEffects: [],
    submittedAt: NOW,
    ...overrides,
  };
}

describe('EnforcementStore', () => {
  it('1. can store and retrieve an EnforcementRequest', () => {
    const store = new EnforcementStore();
    const request = buildRequest();
    store.saveRequest(request);
    assert.deepEqual(store.getRequest(request.id), request);
  });

  it('2. can store and retrieve an EnforcementDecision', () => {
    const store = new EnforcementStore();
    const decision: EnforcementDecision = {
      id: 'enforcement-decision-000001',
      enforcementRequestId: 'enforcement-request-000001',
      type: 'execute_allowed',
      allowedToExecute: true,
      reasonCode: 'ALL_POLICIES_SATISFIED',
      reason: 'ok',
      decidedAt: NOW,
      policyResults: [],
    };
    store.saveDecision(decision);
    assert.deepEqual(store.getDecision(decision.id), decision);
  });

  it('3. can store and retrieve an ExecutionResult', () => {
    const store = new EnforcementStore();
    const result: ExecutionResult = {
      id: 'execution-result-000001',
      enforcementRequestId: 'enforcement-request-000001',
      enforcementDecisionId: 'enforcement-decision-000001',
      status: 'executed',
      executed: true,
    };
    store.saveResult(result);
    assert.deepEqual(store.getResult(result.id), result);
  });

  it('4. can store and retrieve a SideEffectDescriptor', () => {
    const store = new EnforcementStore();
    const sideEffect: SideEffectDescriptor = {
      id: 'side-effect-000001',
      enforcementRequestId: 'enforcement-request-000001',
      type: 'write',
      status: 'planned',
      plannedAt: NOW,
    };
    store.saveSideEffect(sideEffect);
    assert.deepEqual(store.getSideEffect(sideEffect.id), sideEffect);
  });

  it('5. can store and retrieve an EnforcementProof', () => {
    const store = new EnforcementStore();
    const proof: EnforcementProof = {
      id: 'enforcement-proof-000001',
      enforcementRequestId: 'enforcement-request-000001',
      enforcementDecisionId: 'enforcement-decision-000001',
      trustDomainId: 'trust-domain-datasys-agent-republic',
      actorId: 'actor-pmfreak-closure-agent',
      action: 'draft_closure_email',
      resourceScope: 'project:HMP-14665',
      allowedToExecute: true,
      executed: true,
      sideEffectIds: [],
      proofHash: 'hash-1',
      createdAt: NOW,
    };
    store.saveProof(proof);
    assert.deepEqual(store.getProof(proof.id), proof);
  });

  it('6. can store and retrieve an EnforcementEvent', () => {
    const store = new EnforcementStore();
    const event: EnforcementEvent = {
      id: 'enforcement-event-000001',
      type: 'enforcement_requested',
      trustDomainId: 'trust-domain-datasys-agent-republic',
      timestamp: NOW,
      payload: {},
      eventHash: 'hash-1',
    };
    store.saveEvent(event);
    assert.deepEqual(store.getEvent(event.id), event);
  });

  it('7. can store and retrieve an EnforcementAdapter', () => {
    const store = new EnforcementStore();
    const adapter: EnforcementAdapter = { id: 'adapter-1', type: 'tool_call', name: 'Tool', requiresIdempotencyKey: false };
    store.saveAdapter(adapter);
    assert.deepEqual(store.getAdapter(adapter.id), adapter);
  });

  it('8. can store and retrieve an EnforcementViolation', () => {
    const store = new EnforcementStore();
    const violation: EnforcementViolation = {
      id: 'enforcement-violation-000001',
      enforcementRequestId: 'enforcement-request-000001',
      type: 'recognition_denied',
      reasonCode: 'RECOGNITION_MISSING',
      reason: 'missing',
      severity: 'error',
      detectedAt: NOW,
    };
    store.saveViolation(violation);
    assert.deepEqual(store.getViolation(violation.id), violation);
  });

  it('9. can query requests by actor', () => {
    const store = new EnforcementStore();
    store.saveRequest(buildRequest({ id: 'r1', actorId: 'actor-a' }));
    store.saveRequest(buildRequest({ id: 'r2', actorId: 'actor-b' }));
    assert.equal(store.getRequestsByActor('actor-a').length, 1);
  });

  it('10. can query requests by trust domain', () => {
    const store = new EnforcementStore();
    store.saveRequest(buildRequest({ id: 'r1', trustDomainId: 'domain-a' }));
    store.saveRequest(buildRequest({ id: 'r2', trustDomainId: 'domain-b' }));
    assert.equal(store.getRequestsByTrustDomain('domain-a').length, 1);
  });

  it('11. can query requests by action', () => {
    const store = new EnforcementStore();
    store.saveRequest(buildRequest({ id: 'r1', action: 'draft_closure_email' }));
    store.saveRequest(buildRequest({ id: 'r2', action: 'approve_payment' }));
    assert.equal(store.getRequestsByAction('approve_payment').length, 1);
  });

  it('12. can query decisions by request', () => {
    const store = new EnforcementStore();
    const decision: EnforcementDecision = {
      id: 'd1',
      enforcementRequestId: 'r1',
      type: 'execute_allowed',
      allowedToExecute: true,
      reasonCode: 'OK',
      reason: 'ok',
      decidedAt: NOW,
      policyResults: [],
    };
    store.saveDecision(decision);
    assert.equal(store.getDecisionsByRequest('r1').length, 1);
    assert.equal(store.getDecisionsByRequest('r2').length, 0);
  });

  it('13. can query results by request', () => {
    const store = new EnforcementStore();
    store.saveResult({ id: 'res1', enforcementRequestId: 'r1', enforcementDecisionId: 'd1', status: 'executed', executed: true });
    assert.equal(store.getResultsByRequest('r1').length, 1);
  });

  it('14. can query events by request', () => {
    const store = new EnforcementStore();
    store.saveEvent({ id: 'e1', type: 'enforcement_requested', trustDomainId: 'td', enforcementRequestId: 'r1', timestamp: NOW, payload: {}, eventHash: 'h1' });
    assert.equal(store.getEvents({ enforcementRequestId: 'r1' }).length, 1);
  });

  it('15. can query proofs by request', () => {
    const store = new EnforcementStore();
    store.saveProof({
      id: 'p1',
      enforcementRequestId: 'r1',
      enforcementDecisionId: 'd1',
      trustDomainId: 'td',
      actorId: 'a1',
      action: 'act',
      resourceScope: 'scope',
      allowedToExecute: true,
      executed: true,
      sideEffectIds: [],
      proofHash: 'h1',
      createdAt: NOW,
    });
    assert.equal(store.getProofsByRequest('r1').length, 1);
  });

  it('16. can update request status', () => {
    const store = new EnforcementStore();
    const request = buildRequest();
    store.saveRequest(request);
    const updated = store.updateRequestStatus(request.id, 'executed');
    assert.equal(updated?.status, 'executed');
    assert.equal(store.getRequest(request.id)?.status, 'executed');
  });

  it('17. can update side effect status', () => {
    const store = new EnforcementStore();
    const sideEffect: SideEffectDescriptor = { id: 'se1', enforcementRequestId: 'r1', type: 'write', status: 'planned', plannedAt: NOW };
    store.saveSideEffect(sideEffect);
    const updated = store.updateSideEffectStatus('se1', 'executed', { executedAt: NOW });
    assert.equal(updated?.status, 'executed');
    assert.equal(updated?.executedAt, NOW);
  });
});
