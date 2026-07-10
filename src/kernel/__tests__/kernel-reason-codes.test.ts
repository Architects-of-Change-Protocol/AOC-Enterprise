import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementDecision } from '../../features/action-enforcement/domain/enforcement-decision.js';
import { AOC_KERNEL_REASON_CODES, mapDecisionToReasonCodes, mapDecisionTypeToStatus } from '../reason-codes/reason-codes.js';

function decision(overrides: Partial<EnforcementDecision>): EnforcementDecision {
  return {
    id: 'enforcement-decision-000001',
    enforcementRequestId: 'enforcement-request-000001',
    type: 'execute_allowed',
    allowedToExecute: true,
    reasonCode: 'ALL_POLICIES_SATISFIED',
    reason: 'All enforcement policies were satisfied.',
    decidedAt: '2026-01-01T00:00:00.000Z',
    policyResults: [],
    ...overrides,
  };
}

describe('mapDecisionTypeToStatus', () => {
  it('maps execute_allowed, dry_run_allowed, and duplicate_suppressed to allowed', () => {
    assert.equal(mapDecisionTypeToStatus('execute_allowed'), 'allowed');
    assert.equal(mapDecisionTypeToStatus('dry_run_allowed'), 'allowed');
    assert.equal(mapDecisionTypeToStatus('duplicate_suppressed'), 'allowed');
  });

  it('maps approval_required, evidence_required, and external_handshake_required to approval_required', () => {
    assert.equal(mapDecisionTypeToStatus('approval_required'), 'approval_required');
    assert.equal(mapDecisionTypeToStatus('evidence_required'), 'approval_required');
    assert.equal(mapDecisionTypeToStatus('external_handshake_required'), 'approval_required');
  });

  it('maps execution_blocked, adapter_denied, emergency_denied, expired, and invalid_request to denied', () => {
    for (const type of ['execution_blocked', 'adapter_denied', 'emergency_denied', 'expired', 'invalid_request']) {
      assert.equal(mapDecisionTypeToStatus(type), 'denied');
    }
  });

  it('fails closed (denied) for an unrecognized decision type', () => {
    assert.equal(mapDecisionTypeToStatus('some_future_decision_type'), 'denied');
  });
});

describe('mapDecisionToReasonCodes', () => {
  it('always returns at least one reason code', () => {
    assert.ok(mapDecisionToReasonCodes(decision({})).length > 0);
  });

  it('refines execution_blocked through the first failed recognition-gated policy', () => {
    const result = mapDecisionToReasonCodes(
      decision({
        type: 'execution_blocked',
        recognitionDecisionType: 'unrecognized_actor',
        policyResults: [
          { policyId: 'emergency_deny', passed: true, reasonCode: 'EMERGENCY_DENY_INACTIVE', reason: 'ok', severity: 'info' },
          { policyId: 'recognition_required', passed: true, reasonCode: 'RECOGNITION_PRESENT', reason: 'ok', severity: 'info' },
          { policyId: 'allow_decision_required', passed: false, reasonCode: 'ROGUE_ACTOR_TYPE', reason: 'unrecognized', severity: 'error' },
        ],
      }),
    );
    assert.equal(result[0], AOC_KERNEL_REASON_CODES.RECOGNITION_ACTOR_UNKNOWN);
  });

  it('maps an out_of_scope recognition denial to AUTHORITY_SCOPE_EXCEEDED', () => {
    const result = mapDecisionToReasonCodes(
      decision({
        type: 'execution_blocked',
        recognitionDecisionType: 'out_of_scope',
        policyResults: [{ policyId: 'allow_decision_required', passed: false, reasonCode: 'OUT_OF_SCOPE', reason: 'wrong scope', severity: 'error' }],
      }),
    );
    assert.ok(result.includes(AOC_KERNEL_REASON_CODES.AUTHORITY_SCOPE_EXCEEDED));
  });

  it('maps an adapter_permission failure to ADAPTER_DENIED', () => {
    const result = mapDecisionToReasonCodes(
      decision({
        type: 'adapter_denied',
        policyResults: [{ policyId: 'adapter_permission', passed: false, reasonCode: 'ADAPTER_ACTION_DENIED', reason: 'denied', severity: 'error' }],
      }),
    );
    assert.ok(result.includes(AOC_KERNEL_REASON_CODES.ADAPTER_DENIED));
  });

  it('maps a plain execute_allowed decision to ACTION_ALLOWED', () => {
    assert.deepEqual(mapDecisionToReasonCodes(decision({})), [AOC_KERNEL_REASON_CODES.ACTION_ALLOWED]);
  });

  it('maps dry_run_allowed to ACTION_ALLOWED_DRY_RUN', () => {
    assert.deepEqual(mapDecisionToReasonCodes(decision({ type: 'dry_run_allowed' })), [AOC_KERNEL_REASON_CODES.ACTION_ALLOWED_DRY_RUN]);
  });
});
