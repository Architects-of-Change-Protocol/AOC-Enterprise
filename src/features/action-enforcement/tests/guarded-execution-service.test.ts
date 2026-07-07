import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import { AdapterRegistry } from '../services/adapter-registry.js';
import { EnforcementDecisionService } from '../services/enforcement-decision-service.js';
import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementPolicyEvaluator } from '../services/enforcement-policy-evaluator.js';
import { EnforcementPreflightService } from '../services/enforcement-preflight-service.js';
import { EnforcementProofService } from '../services/enforcement-proof-service.js';
import { EnforcementResultService } from '../services/enforcement-result-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { GuardedExecutionService } from '../services/guarded-execution-service.js';
import { IdempotencyService } from '../services/idempotency-service.js';
import { SideEffectLedger } from '../services/side-effect-ledger.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp(result: RecognitionVerificationResult, emergencyDeny = false) {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  const ledger = new EnforcementLedger(ctx, store);
  const sideEffectLedger = new SideEffectLedger(ctx, store, ledger);
  const decisionService = new EnforcementDecisionService(ctx, store);
  const policyEvaluator = new EnforcementPolicyEvaluator();
  const adapterRegistry = new AdapterRegistry(store);
  const idempotencyService = new IdempotencyService(ctx);
  const resultService = new EnforcementResultService(ctx, store);
  const proofService = new EnforcementProofService(ctx, store);
  const recognitionIntegration: EnforcementRecognitionIntegration = { verifyAction: () => result };
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
  const guardedExecutionService = new GuardedExecutionService(ctx, store, ledger, preflightService, resultService, proofService, sideEffectLedger, idempotencyService);
  return { store, ledger, guardedExecutionService };
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
    sideEffects: [{ id: 'side-effect-1', enforcementRequestId: 'enforcement-request-1', type: 'write', status: 'planned', plannedAt: NOW }],
    submittedAt: NOW,
    ...overrides,
  };
}

/** Saves a request and registers its embedded side-effect snapshot into the store too, mirroring what EnforcementRequestService does in production. */
function saveRequest(store: EnforcementStore, overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  const request = buildRequest(overrides);
  store.saveRequest(request);
  for (const sideEffect of request.sideEffects) {
    store.saveSideEffect(sideEffect);
  }
  return request;
}

const ALLOW: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };
const DENY: RecognitionVerificationResult = { type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' };
const APPROVAL: RecognitionVerificationResult = { type: 'require_human_approval', reasonCode: 'APPROVAL', reason: 'needs approval' };
const EVIDENCE: RecognitionVerificationResult = { type: 'require_more_evidence', reasonCode: 'EVIDENCE', reason: 'needs evidence' };

describe('GuardedExecutionService', () => {
  it('1. executes the callback when preflight allows', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    let ran = false;
    await guardedExecutionService.run(request, () => {
      ran = true;
      return 'value';
    });
    assert.equal(ran, true);
  });

  it('2. does not execute the callback when preflight blocks', async () => {
    const { guardedExecutionService, store } = setUp(DENY);
    const request = saveRequest(store);
    let ran = false;
    await guardedExecutionService.run(request, () => {
      ran = true;
      return 'value';
    });
    assert.equal(ran, false);
  });

  it('3. does not execute the callback when approval is required', async () => {
    const { guardedExecutionService, store } = setUp(APPROVAL);
    const request = saveRequest(store);
    let ran = false;
    const outcome = await guardedExecutionService.run(request, () => {
      ran = true;
      return 'value';
    });
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'approval_required');
  });

  it('4. does not execute the callback when evidence is required', async () => {
    const { guardedExecutionService, store } = setUp(EVIDENCE);
    const request = saveRequest(store);
    let ran = false;
    const outcome = await guardedExecutionService.run(request, () => {
      ran = true;
      return 'value';
    });
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'evidence_required');
  });

  it('5. does not execute the callback in dry-run mode', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store, { mode: 'dry_run' });
    let ran = false;
    const outcome = await guardedExecutionService.run(request, () => {
      ran = true;
      return 'value';
    });
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'dry_run_allowed');
    assert.notEqual(outcome.request.sideEffects[0]?.status, 'executed');
  });

  it('6. does not execute the callback when a duplicate idempotency key already succeeded', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const first = saveRequest(store, { id: 'r1', idempotencyKey: 'key-1' });
    await guardedExecutionService.run(first, () => 'value');

    let ranSecondTime = false;
    const second = saveRequest(store, { id: 'r2', idempotencyKey: 'key-1', sideEffects: [{ id: 'side-effect-2', enforcementRequestId: 'r2', type: 'write', status: 'planned', plannedAt: NOW }] });
    const outcome = await guardedExecutionService.run(second, () => {
      ranSecondTime = true;
      return 'value-2';
    });
    assert.equal(ranSecondTime, false);
    assert.equal(outcome.decision.type, 'duplicate_suppressed');
  });

  it('7. executes the callback exactly once when allowed', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    let count = 0;
    await guardedExecutionService.run(request, () => {
      count += 1;
      return 'value';
    });
    assert.equal(count, 1);
  });

  it('8. captures the callback return value', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    const outcome = await guardedExecutionService.run(request, () => 'the-value');
    assert.equal(outcome.result.value, 'the-value');
    assert.equal(outcome.result.status, 'executed');
  });

  it('9. captures a thrown error from the callback', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    const outcome = await guardedExecutionService.run(request, () => {
      throw new Error('boom');
    });
    assert.equal(outcome.result.status, 'failed');
    assert.equal(outcome.result.errorMessage, 'boom');
  });

  it('10. records execution_started', async () => {
    const { guardedExecutionService, store, ledger } = setUp(ALLOW);
    const request = saveRequest(store);
    await guardedExecutionService.run(request, () => 'value');
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'execution_started'));
  });

  it('11. records execution_succeeded', async () => {
    const { guardedExecutionService, store, ledger } = setUp(ALLOW);
    const request = saveRequest(store);
    await guardedExecutionService.run(request, () => 'value');
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'execution_succeeded'));
  });

  it('12. records execution_failed', async () => {
    const { guardedExecutionService, store, ledger } = setUp(ALLOW);
    const request = saveRequest(store);
    await guardedExecutionService.run(request, () => {
      throw new Error('boom');
    });
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'execution_failed'));
  });

  it('13. creates an ExecutionResult', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    const outcome = await guardedExecutionService.run(request, () => 'value');
    assert.ok(outcome.result.id);
  });

  it('14. creates an EnforcementProof', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    const outcome = await guardedExecutionService.run(request, () => 'value');
    assert.ok(outcome.proof);
    assert.ok(outcome.proof?.proofHash);
  });

  it('15. updates side effect status to executed on success', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    const outcome = await guardedExecutionService.run(request, () => 'value');
    assert.equal(outcome.request.sideEffects[0]?.status, 'executed');
  });

  it('16. updates side effect status to failed on failure', async () => {
    const { guardedExecutionService, store } = setUp(ALLOW);
    const request = saveRequest(store);
    const outcome = await guardedExecutionService.run(request, () => {
      throw new Error('boom');
    });
    assert.equal(outcome.request.sideEffects[0]?.status, 'failed');
  });
});
