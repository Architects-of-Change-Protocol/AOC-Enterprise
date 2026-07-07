import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementPolicyPackEvaluationResult, EnforcementPolicyPackIntegration } from '../domain/policy-pack-enforcement.js';
import { AdapterRegistry } from '../services/adapter-registry.js';
import { EnforcementDecisionService } from '../services/enforcement-decision-service.js';
import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementPolicyEvaluator } from '../services/enforcement-policy-evaluator.js';
import { EnforcementPreflightService } from '../services/enforcement-preflight-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { IdempotencyService } from '../services/idempotency-service.js';
import { PolicyPackEnforcementService } from '../services/policy-pack-enforcement-service.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function fakeRecognition(result: RecognitionVerificationResult): EnforcementRecognitionIntegration {
  return { verifyAction: () => result };
}

function fakePolicyPack(result: EnforcementPolicyPackEvaluationResult): EnforcementPolicyPackIntegration {
  return { evaluatePolicyForEnforcement: () => result };
}

const ALLOW_RECOGNITION: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };

function setUp(
  recognitionIntegration: EnforcementRecognitionIntegration,
  policyPackIntegration?: EnforcementPolicyPackIntegration,
  emergencyDeny = false,
) {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  const ledger = new EnforcementLedger(ctx, store);
  const decisionService = new EnforcementDecisionService(ctx, store);
  const policyEvaluator = new EnforcementPolicyEvaluator();
  const adapterRegistry = new AdapterRegistry(store);
  const idempotencyService = new IdempotencyService(ctx);
  const policyPackService = new PolicyPackEnforcementService(ctx, policyPackIntegration);
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
    policyPackService,
  );
  return { store, ledger, preflightService };
}

/**
 * `sideEffectType: 'write'` deliberately avoids the core `side_effect_boundary`
 * policy's approval-proof requirement (which applies to financial/legal/
 * data_export side effects) -- this suite is about the `domain_policy_pack`
 * policy specifically, so allow-path scenarios must not trip an unrelated
 * core policy later in the chain.
 */
function buildRequest(overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  return {
    id: 'enforcement-request-1',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'project:1',
    target: { id: 'target-1', type: 'tool_call', name: 'approve_payment' },
    intent: { id: 'intent-1', action: 'approve_payment', resourceScope: 'project:1', riskLevel: 'medium', sideEffectType: 'write' },
    sideEffects: [],
    submittedAt: NOW,
    ...overrides,
  };
}

describe('Action Enforcement preflight <-> Domain Policy Pack Runtime wiring', () => {
  it('1. preflight calls the policy pack integration when configured and core recognition allows', () => {
    let calls = 0;
    const policyPack = { evaluatePolicyForEnforcement: () => (calls += 1, { type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' } as const) };
    const { preflightService, store } = setUp(fakeRecognition(ALLOW_RECOGNITION), policyPack);
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    assert.equal(calls, 1);
  });

  it('2. policy_denied changes execute_allowed into execution_blocked', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'execution_blocked');
    assert.equal(decision.allowedToExecute, false);
  });

  it('3. policy_requires_evidence changes execute_allowed into evidence_required', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_requires_evidence', allowed: false, reasonCode: 'EVIDENCE', reason: 'evidence' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'evidence_required');
    assert.equal(decision.allowedToExecute, false);
  });

  it('4. policy_requires_approval changes execute_allowed into approval_required', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_requires_approval', allowed: false, reasonCode: 'APPROVAL', reason: 'approval' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'approval_required');
    assert.equal(decision.allowedToExecute, false);
  });

  it('5. policy_requires_authority blocks execution', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_requires_authority', allowed: false, reasonCode: 'AUTHORITY', reason: 'authority' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.allowedToExecute, false);
  });

  it('6. policy_requires_external_standing blocks execution', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_requires_external_standing', allowed: false, reasonCode: 'STANDING', reason: 'standing' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'external_handshake_required');
    assert.equal(decision.allowedToExecute, false);
  });

  it('7. policy_warning preserves execute_allowed', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_warning', allowed: true, reasonCode: 'WARN', reason: 'warn' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'execute_allowed');
    assert.equal(decision.allowedToExecute, true);
  });

  it('8. policy_not_applicable preserves execute_allowed', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_not_applicable', allowed: true, reasonCode: 'NA', reason: 'na' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'execute_allowed');
  });

  it('9. policy_allowed preserves execute_allowed', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'execute_allowed');
  });

  it('10-11-13-14. policy metadata (decision id, proof id, pack version ids, matched rule ids) is attached to EnforcementDecision', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({
        type: 'policy_denied',
        allowed: false,
        reasonCode: 'DENY',
        reason: 'deny',
        policyDecisionId: 'policy-decision-1',
        policyProofId: 'policy-proof-1',
        policyPackVersionIds: ['pack-version-1'],
        matchedRuleIds: ['rule-1', 'rule-2'],
      }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.policyDecisionId, 'policy-decision-1');
    assert.equal(decision.policyProofId, 'policy-proof-1');
    assert.deepEqual(decision.policyPackVersionIds, ['pack-version-1']);
    assert.deepEqual(decision.policyMatchedRuleIds, ['rule-1', 'rule-2']);
  });

  it('15. policy_pack_evaluated event is recorded', () => {
    const { preflightService, store, ledger } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok', policyDecisionId: 'policy-decision-1' }),
    );
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    assert.ok(ledger.getTrailByRequest(request.id).some((event) => event.type === 'policy_pack_evaluated'));
  });

  it('16. policy block records an EnforcementViolation', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny', policyDecisionId: 'policy-decision-1' }),
    );
    const request = store.saveRequest(buildRequest());
    preflightService.preflight(request);
    const violations = store.getViolationsByRequest(request.id);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.type, 'policy_denied');
  });

  it('17. when recognition blocks, policy allow does not override', () => {
    const { preflightService, store } = setUp(
      fakeRecognition({ type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' }),
      fakePolicyPack({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' }),
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'execution_blocked');
    assert.equal(decision.allowedToExecute, false);
  });

  it('18. when emergency deny is active, policy allow does not override', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' }),
      true,
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'emergency_denied');
    assert.equal(decision.allowedToExecute, false);
  });

  it('19. when dry_run is requested, policy allow still resolves to dry_run_allowed (no execution)', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      fakePolicyPack({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' }),
    );
    const request = store.saveRequest(buildRequest({ mode: 'dry_run' }));
    const decision = preflightService.preflight(request);
    assert.equal(decision.type, 'dry_run_allowed');
    assert.equal(decision.allowedToExecute, false);
  });

  it('20. malformed policy pack result still records a violation and blocks', () => {
    const { preflightService, store } = setUp(
      fakeRecognition(ALLOW_RECOGNITION),
      // @ts-expect-error -- deliberately invalid shape from a misbehaving integration
      { evaluatePolicyForEnforcement: () => ({ type: 'not_a_real_type' }) },
    );
    const request = store.saveRequest(buildRequest());
    const decision = preflightService.preflight(request);
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.policyReasonCode, 'POLICY_PACK_INVALID_RESULT');
  });
});
