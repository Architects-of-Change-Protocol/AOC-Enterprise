import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DomainPolicyPackPolicy } from '../policies/domain-policy-pack-policy.js';
import { createDefaultEnforcementPolicyChain } from '../policies/index.js';
import type { EnforcementPolicyContext } from '../domain/enforcement-verification.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementPolicyPackEvaluationResult } from '../domain/policy-pack-enforcement.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildRequest(): EnforcementRequest {
  return {
    id: 'enforcement-request-1',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'project:1',
    target: { id: 'target-1', type: 'tool_call', name: 'approve_payment' },
    intent: { id: 'intent-1', action: 'approve_payment', resourceScope: 'project:1', riskLevel: 'critical', sideEffectType: 'financial' },
    sideEffects: [],
    submittedAt: NOW,
  };
}

function buildContext(policyPackResult?: EnforcementPolicyPackEvaluationResult): EnforcementPolicyContext {
  return {
    now: NOW,
    request: buildRequest(),
    emergencyDeny: false,
    ...(policyPackResult !== undefined ? { policyPackResult } : {}),
  };
}

describe('DomainPolicyPackPolicy', () => {
  it('1. passes when integration is not configured (no policyPackResult in context)', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(buildContext());
    assert.equal(outcome.passed, true);
    assert.equal(outcome.reasonCode, 'POLICY_PACK_NOT_CONFIGURED');
  });

  it('2. passes policy_allowed', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(buildContext({ type: 'policy_allowed', allowed: true, reasonCode: 'OK', reason: 'ok' }));
    assert.equal(outcome.passed, true);
    assert.equal(outcome.decisionType, undefined);
  });

  it('3. passes policy_warning but records warning severity', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(buildContext({ type: 'policy_warning', allowed: true, reasonCode: 'WARN', reason: 'warn' }));
    assert.equal(outcome.passed, true);
    assert.equal(outcome.severity, 'warning');
  });

  it('4. passes policy_not_applicable', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(
      buildContext({ type: 'policy_not_applicable', allowed: true, reasonCode: 'NA', reason: 'na' }),
    );
    assert.equal(outcome.passed, true);
  });

  it('5. fails policy_denied', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(buildContext({ type: 'policy_denied', allowed: false, reasonCode: 'DENY', reason: 'deny' }));
    assert.equal(outcome.passed, false);
    assert.equal(outcome.decisionType, 'execution_blocked');
    assert.equal(outcome.severity, 'critical');
  });

  it('6. fails policy_requires_evidence', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(
      buildContext({ type: 'policy_requires_evidence', allowed: false, reasonCode: 'EVIDENCE', reason: 'evidence' }),
    );
    assert.equal(outcome.passed, false);
    assert.equal(outcome.decisionType, 'evidence_required');
  });

  it('7. fails policy_requires_approval', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(
      buildContext({ type: 'policy_requires_approval', allowed: false, reasonCode: 'APPROVAL', reason: 'approval' }),
    );
    assert.equal(outcome.passed, false);
    assert.equal(outcome.decisionType, 'approval_required');
  });

  it('8. fails policy_requires_authority', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(
      buildContext({ type: 'policy_requires_authority', allowed: false, reasonCode: 'AUTHORITY', reason: 'authority' }),
    );
    assert.equal(outcome.passed, false);
    assert.equal(outcome.decisionType, 'execution_blocked');
  });

  it('9. fails policy_requires_external_standing', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(
      buildContext({ type: 'policy_requires_external_standing', allowed: false, reasonCode: 'STANDING', reason: 'standing' }),
    );
    assert.equal(outcome.passed, false);
    assert.equal(outcome.decisionType, 'external_handshake_required');
  });

  it('10. fails malformed policy result (already resolved to policy_denied by the service upstream)', () => {
    const outcome = new DomainPolicyPackPolicy().evaluate(
      buildContext({ type: 'policy_denied', allowed: false, reasonCode: 'POLICY_PACK_INVALID_RESULT', reason: 'invalid' }),
    );
    assert.equal(outcome.passed, false);
    assert.equal(outcome.severity, 'critical');
  });

  it('11. policy results are deterministic for identical input', () => {
    const policy = new DomainPolicyPackPolicy();
    const result: EnforcementPolicyPackEvaluationResult = { type: 'policy_requires_approval', allowed: false, reasonCode: 'APPROVAL', reason: 'approval' };
    const first = policy.evaluate(buildContext(result));
    const second = policy.evaluate(buildContext(result));
    assert.deepEqual(first, second);
  });

  it('12. policy order includes domain_policy_pack at the expected position (after adapter_permission, before idempotency)', () => {
    const ids = createDefaultEnforcementPolicyChain().map((policy) => policy.id);
    const adapterIndex = ids.indexOf('adapter_permission');
    const policyPackIndex = ids.indexOf('domain_policy_pack');
    const idempotencyIndex = ids.indexOf('idempotency');
    assert.ok(adapterIndex >= 0 && policyPackIndex >= 0 && idempotencyIndex >= 0);
    assert.ok(adapterIndex < policyPackIndex);
    assert.ok(policyPackIndex < idempotencyIndex);
  });
});
