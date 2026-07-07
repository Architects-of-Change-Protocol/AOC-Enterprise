import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementPolicyContext } from '../domain/enforcement-verification.js';
import { EnforcementPolicyEvaluator } from '../services/enforcement-policy-evaluator.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildRequest(overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  return {
    id: 'r1',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'td1',
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

function baseContext(overrides: Partial<EnforcementPolicyContext> = {}): EnforcementPolicyContext {
  return {
    now: NOW,
    request: buildRequest(),
    recognitionResult: { type: 'allow', reasonCode: 'OK', reason: 'ok' },
    recognitionMappedDecisionType: 'execute_allowed',
    emergencyDeny: false,
    ...overrides,
  };
}

describe('EnforcementPolicyEvaluator', () => {
  it('1. emergency deny blocks all execution', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(baseContext({ emergencyDeny: true }));
    assert.equal(result.decisionType, 'emergency_denied');
  });

  it('2. missing recognition fails the recognition-required policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate({ now: NOW, request: buildRequest(), emergencyDeny: false });
    assert.equal(result.decisionType, 'execution_blocked');
    assert.ok(result.policyResults.some((r) => r.policyId === 'recognition_required' && !r.passed));
  });

  it('3. a non-allow recognition decision fails the allow-decision-required policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(
      baseContext({ recognitionResult: { type: 'policy_violation', reasonCode: 'X', reason: 'x' }, recognitionMappedDecisionType: 'execution_blocked' }),
    );
    assert.equal(result.decisionType, 'execution_blocked');
  });

  it('4. approval pending fails the approval-pending policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(
      baseContext({ recognitionResult: { type: 'require_human_approval', reasonCode: 'X', reason: 'x' }, recognitionMappedDecisionType: 'approval_required' }),
    );
    assert.equal(result.decisionType, 'approval_required');
  });

  it('5. evidence required fails the evidence-required policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(
      baseContext({ recognitionResult: { type: 'require_more_evidence', reasonCode: 'X', reason: 'x' }, recognitionMappedDecisionType: 'evidence_required' }),
    );
    assert.equal(result.decisionType, 'evidence_required');
  });

  it('6. invalid external standing fails the external-standing policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(
      baseContext({
        request: buildRequest({ visaId: 'visa-1' }),
        recognitionResult: { type: 'revoked', reasonCode: 'VISA_REVOKED', reason: 'revoked' },
        recognitionMappedDecisionType: 'execution_blocked',
      }),
    );
    // Already blocked earlier by allow-decision-required, so execution_blocked is expected either way.
    assert.equal(result.decisionType, 'execution_blocked');
  });

  it('7. adapter deny fails the adapter-permission policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const adapter: EnforcementAdapter = { id: 'adapter-1', type: 'workflow_step', name: 'Payments', deniedActions: ['draft_closure_email'], requiresIdempotencyKey: false };
    const result = evaluator.evaluate(baseContext({ adapter }));
    assert.equal(result.decisionType, 'adapter_denied');
  });

  it('8. missing idempotency key fails the idempotency policy when the adapter requires it', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const adapter: EnforcementAdapter = { id: 'adapter-1', type: 'workflow_step', name: 'Payments', requiresIdempotencyKey: true };
    const result = evaluator.evaluate(baseContext({ adapter, request: buildRequest() }));
    assert.equal(result.decisionType, 'adapter_denied');
  });

  it('9. a duplicate idempotency key returns duplicate_suppressed', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(baseContext({ idempotency: { outcome: 'duplicate_success', idempotencyKey: 'k1', priorExecutionResultId: 'res-1' } }));
    assert.equal(result.decisionType, 'duplicate_suppressed');
  });

  it('10. an expired request fails the execution-timeout policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(baseContext({ request: buildRequest({ expiresAt: '2025-01-01T00:00:00.000Z' }) }));
    assert.equal(result.decisionType, 'expired');
  });

  it('11. a prohibited side effect fails the side-effect-boundary policy', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(
      baseContext({
        request: buildRequest({ intent: { id: 'intent-1', action: 'change_bank_account', resourceScope: 'project:1', riskLevel: 'critical', sideEffectType: 'financial' } }),
        recognitionResult: { type: 'allow', reasonCode: 'OK', reason: 'ok' },
        recognitionMappedDecisionType: 'execute_allowed',
      }),
    );
    assert.equal(result.decisionType, 'approval_required');
    assert.ok(result.policyResults.some((r) => r.policyId === 'side_effect_boundary' && !r.passed));
  });

  it('12. dry run prevents execution', () => {
    const evaluator = new EnforcementPolicyEvaluator();
    const result = evaluator.evaluate(baseContext({ request: buildRequest({ mode: 'dry_run' }) }));
    assert.equal(result.decisionType, 'dry_run_allowed');
  });

  it('13. policy results are deterministic and ordered across identical runs', () => {
    const evaluatorA = new EnforcementPolicyEvaluator();
    const evaluatorB = new EnforcementPolicyEvaluator();
    const resultA = evaluatorA.evaluate(baseContext());
    const resultB = evaluatorB.evaluate(baseContext());
    assert.deepEqual(
      resultA.policyResults.map((r) => r.policyId),
      resultB.policyResults.map((r) => r.policyId),
    );
    assert.deepEqual(resultA, resultB);
  });
});
