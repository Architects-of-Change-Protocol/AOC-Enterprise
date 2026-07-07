import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import { AdapterRegistry } from '../services/adapter-registry.js';
import { EnforcementDecisionService } from '../services/enforcement-decision-service.js';
import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementPolicyEvaluator } from '../services/enforcement-policy-evaluator.js';
import { EnforcementPreflightService } from '../services/enforcement-preflight-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { IdempotencyService } from '../services/idempotency-service.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function fakeIntegration(result: RecognitionVerificationResult): EnforcementRecognitionIntegration {
  return { verifyAction: () => result };
}

let calls = 0;
function trackingIntegration(result: RecognitionVerificationResult): EnforcementRecognitionIntegration {
  return {
    verifyAction: () => {
      calls += 1;
      return result;
    },
  };
}

function setUp(recognitionIntegration: EnforcementRecognitionIntegration, emergencyDeny = false) {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  const ledger = new EnforcementLedger(ctx, store);
  const decisionService = new EnforcementDecisionService(ctx, store);
  const policyEvaluator = new EnforcementPolicyEvaluator();
  const adapterRegistry = new AdapterRegistry(store);
  const idempotencyService = new IdempotencyService(ctx);
  const preflightService = new EnforcementPreflightService(
    ctx,
    store,
    ledger,
    decisionService,
    policyEvaluator,
    adapterRegistry,
    idempotencyService,
    recognitionIntegration,
    () => emergencyDeny,
  );
  return { store, ledger, preflightService };
}

function buildRequest(overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  return {
    id: 'enforcement-request-1',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'draft_closure_email',
    resourceScope: 'project:1',
    target: { id: 'target-1', type: 'tool_call', name: 'draft_closure_email' },
    intent: { id: 'intent-1', action: 'draft_closure_email', resourceScope: 'project:1', riskLevel: 'medium', sideEffectType: 'write' },
    sideEffects: [],
    submittedAt: NOW,
    ...overrides,
  };
}

describe('EnforcementPreflightService', () => {
  it('1. calls the Recognition Runtime integration', () => {
    calls = 0;
    const { preflightService, store } = setUp(trackingIntegration({ type: 'allow', reasonCode: 'OK', reason: 'ok' }));
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    assert.equal(calls, 1);
  });

  it('2. maps an allow recognition decision to execute_allowed', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'allow', reasonCode: 'OK', reason: 'ok' }));
    const request = store.saveRequest(buildRequest());
    assert.equal(preflightService.preflight(request).type, 'execute_allowed');
  });

  it('3. maps require_human_approval to approval_required', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'require_human_approval', reasonCode: 'APPROVAL', reason: 'needs approval' }));
    const request = store.saveRequest(buildRequest());
    assert.equal(preflightService.preflight(request).type, 'approval_required');
  });

  it('4. maps require_more_evidence to evidence_required', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'require_more_evidence', reasonCode: 'EVIDENCE', reason: 'needs evidence' }));
    const request = store.saveRequest(buildRequest());
    assert.equal(preflightService.preflight(request).type, 'evidence_required');
  });

  it('5. maps unrecognized_actor to execution_blocked', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' }));
    const request = store.saveRequest(buildRequest());
    assert.equal(preflightService.preflight(request).type, 'execution_blocked');
  });

  it('6. maps revoked to execution_blocked', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'revoked', reasonCode: 'REVOKED', reason: 'revoked' }));
    const request = store.saveRequest(buildRequest());
    assert.equal(preflightService.preflight(request).type, 'execution_blocked');
  });

  it('7. maps expired to expired', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'expired', reasonCode: 'EXPIRED', reason: 'expired' }));
    const request = store.saveRequest(buildRequest());
    assert.equal(preflightService.preflight(request).type, 'expired');
  });

  it('8. blocks an unknown recognition result by default', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'something_unexpected', reasonCode: 'X', reason: 'x' }));
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'execution_blocked');
    assert.equal(decision.allowedToExecute, false);
  });

  it('9. records preflight_started', () => {
    const { preflightService, store, ledger } = setUp(fakeIntegration({ type: 'allow', reasonCode: 'OK', reason: 'ok' }));
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'preflight_started'));
  });

  it('10. records preflight_passed when allowed', () => {
    const { preflightService, store, ledger } = setUp(fakeIntegration({ type: 'allow', reasonCode: 'OK', reason: 'ok' }));
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'preflight_passed'));
  });

  it('11. records preflight_failed when blocked', () => {
    const { preflightService, store, ledger } = setUp(fakeIntegration({ type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' }));
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'preflight_failed'));
  });

  it('12. never invokes a callback -- preflight has no executor to call', () => {
    const { preflightService, store } = setUp(fakeIntegration({ type: 'allow', reasonCode: 'OK', reason: 'ok' }));
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(typeof decision, 'object');
    assert.equal('execute' in decision, false);
  });
});
