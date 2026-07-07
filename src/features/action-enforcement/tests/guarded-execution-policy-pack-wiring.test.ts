import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import type { EnforcementPolicyPackEvaluationResult, EnforcementPolicyPackIntegration } from '../domain/policy-pack-enforcement.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { CreateEnforcementRequestInput } from '../services/enforcement-request-service.js';

const NOW = '2026-01-01T00:00:00.000Z';
const ALLOW_RECOGNITION: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };

function fakeRecognition(result: RecognitionVerificationResult = ALLOW_RECOGNITION): EnforcementRecognitionIntegration {
  return { verifyAction: () => result };
}

function fakePolicyPack(result: EnforcementPolicyPackEvaluationResult): EnforcementPolicyPackIntegration {
  return { evaluatePolicyForEnforcement: () => result };
}

/**
 * `sideEffectType: 'write'` deliberately avoids the core `side_effect_boundary`
 * policy's approval-proof requirement (which applies to financial/legal/
 * data_export side effects) -- this suite is about the `domain_policy_pack`
 * policy specifically, so allow-path scenarios must not trip an unrelated
 * core policy later in the chain.
 */
function requestInput(overrides: Partial<CreateEnforcementRequestInput> = {}): CreateEnforcementRequestInput {
  return {
    mode: 'execute',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'project:1',
    target: { id: 'target-1', type: 'tool_call', name: 'approve_payment' },
    intent: { id: 'intent-1', action: 'approve_payment', resourceScope: 'project:1', riskLevel: 'medium', sideEffectType: 'write' },
    ...overrides,
  };
}

function buildRuntime(policyPackIntegration?: EnforcementPolicyPackIntegration, recognitionResult: RecognitionVerificationResult = ALLOW_RECOGNITION) {
  const ctx = createEnforcementRuntimeContext(NOW);
  return createActionEnforcementRuntime(ctx, fakeRecognition(recognitionResult), { policyPackIntegration });
}

describe('GuardedExecutionService <-> Domain Policy Pack Runtime wiring', () => {
  it('1. executor runs when policy_allowed and core allows', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    const outcome = await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 1);
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(outcome.result.executed, true);
  });

  it('2. executor runs when policy_warning and core allows', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_warning', allowed: true, reasonCode: 'WARN', reason: 'warn' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 1);
  });

  it('3. executor runs when policy_not_applicable and core allows', async () => {
    const runtime = buildRuntime();
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 1);
  });

  it('4. executor does not run when policy_denied', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 0);
  });

  it('5. executor does not run when policy_requires_evidence', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_requires_evidence', allowed: false, reasonCode: 'EVIDENCE', reason: 'evidence' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 0);
  });

  it('6. executor does not run when policy_requires_approval', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_requires_approval', allowed: false, reasonCode: 'APPROVAL', reason: 'approval' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 0);
  });

  it('7. executor does not run when policy_requires_authority', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_requires_authority', allowed: false, reasonCode: 'AUTHORITY', reason: 'authority' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 0);
  });

  it('8. executor does not run when policy_requires_external_standing', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_requires_external_standing', allowed: false, reasonCode: 'STANDING', reason: 'standing' }));
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 0);
  });

  it('9. executor does not run when policy integration throws', async () => {
    const runtime = buildRuntime({
      evaluatePolicyForEnforcement() {
        throw new Error('policy pack unavailable');
      },
    });
    const request = runtime.createEnforcementRequest(requestInput());
    let ran = 0;
    await runtime.enforce(request, () => (ran += 1, 'done'));
    assert.equal(ran, 0);
  });

  it('10. execution result is not_executed for policy blocks', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny' }));
    const request = runtime.createEnforcementRequest(requestInput());
    const outcome = await runtime.enforce(request, () => 'done');
    assert.equal(outcome.result.status, 'not_executed');
    assert.equal(outcome.result.executed, false);
  });

  it('11. side effects are blocked for policy blocks', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny' }));
    const request = runtime.createEnforcementRequest(requestInput());
    const outcome = await runtime.enforce(request, () => 'done');
    const sideEffects = outcome.request.sideEffects;
    assert.ok(sideEffects.length > 0);
    assert.ok(sideEffects.every((sideEffect) => sideEffect.status === 'blocked'));
  });

  it('12. proof is still created for policy-blocked outcomes', async () => {
    const runtime = buildRuntime(fakePolicyPack({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny' }));
    const request = runtime.createEnforcementRequest(requestInput());
    const outcome = await runtime.enforce(request, () => 'done');
    assert.ok(outcome.proof);
    assert.equal(outcome.proof?.allowedToExecute, false);
  });
});
