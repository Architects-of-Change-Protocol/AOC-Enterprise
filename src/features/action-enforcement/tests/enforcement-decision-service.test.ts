import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RecognitionVerificationResult } from '../domain/enforcement-context.js';
import { EnforcementDecisionService } from '../services/enforcement-decision-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  return { ctx, store, service: new EnforcementDecisionService(ctx, store) };
}

function result(overrides: Partial<RecognitionVerificationResult>): RecognitionVerificationResult {
  return { id: 'recognition-decision-1', type: 'allow', reasonCode: 'OK', reason: 'ok', ...overrides };
}

describe('EnforcementDecisionService', () => {
  it('1. creates an execute_allowed decision from an allow recognition result', () => {
    const { service } = setUp();
    const mapped = service.mapRecognitionResult(result({ type: 'allow' }));
    assert.equal(mapped.decisionType, 'execute_allowed');
  });

  it('2. creates an execution_blocked decision from a denied recognition result', () => {
    const { service } = setUp();
    const mapped = service.mapRecognitionResult(result({ type: 'unrecognized_actor' }));
    assert.equal(mapped.decisionType, 'execution_blocked');
  });

  it('3. creates an approval_required decision from require_human_approval', () => {
    const { service } = setUp();
    const mapped = service.mapRecognitionResult(result({ type: 'require_human_approval' }));
    assert.equal(mapped.decisionType, 'approval_required');
  });

  it('4. creates an evidence_required decision from require_more_evidence', () => {
    const { service } = setUp();
    const mapped = service.mapRecognitionResult(result({ type: 'require_more_evidence' }));
    assert.equal(mapped.decisionType, 'evidence_required');
  });

  it('5. creates an expired decision from an expired recognition result', () => {
    const { service } = setUp();
    const mapped = service.mapRecognitionResult(result({ type: 'expired' }));
    assert.equal(mapped.decisionType, 'expired');
  });

  it('6. creates a dry_run_allowed decision when instructed by the policy evaluator', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'dry_run_allowed',
      reasonCode: 'DRY_RUN_NO_EXECUTION',
      reason: 'dry run',
      policyResults: [],
    });
    assert.equal(decision.type, 'dry_run_allowed');
    assert.equal(decision.allowedToExecute, false);
  });

  it('7. creates a duplicate_suppressed decision when instructed by the policy evaluator', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'duplicate_suppressed',
      reasonCode: 'DUPLICATE_SUPPRESSED',
      reason: 'duplicate',
      policyResults: [],
    });
    assert.equal(decision.type, 'duplicate_suppressed');
    assert.equal(decision.allowedToExecute, false);
  });

  it('8. creates an emergency_denied decision when instructed by the policy evaluator', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'emergency_denied',
      reasonCode: 'EMERGENCY_DENIED',
      reason: 'emergency',
      policyResults: [],
    });
    assert.equal(decision.type, 'emergency_denied');
    assert.equal(decision.allowedToExecute, false);
  });

  it('9. attaches the upstream recognitionDecisionId', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'execute_allowed',
      reasonCode: 'OK',
      reason: 'ok',
      policyResults: [],
      recognitionResult: result({ id: 'recognition-decision-42', type: 'allow' }),
    });
    assert.equal(decision.recognitionDecisionId, 'recognition-decision-42');
  });

  it('10. attaches the upstream authorityProofId when present', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'execute_allowed',
      reasonCode: 'OK',
      reason: 'ok',
      policyResults: [],
      recognitionResult: result({ type: 'allow', authorityProofId: 'authority-proof-1' }),
    });
    assert.equal(decision.authorityProofId, 'authority-proof-1');
  });

  it('11. attaches the upstream approvalProofId when present', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'execute_allowed',
      reasonCode: 'OK',
      reason: 'ok',
      policyResults: [],
      recognitionResult: result({ type: 'allow', approvalProofId: 'approval-proof-1' }),
    });
    assert.equal(decision.approvalProofId, 'approval-proof-1');
  });

  it('12. attaches the upstream handshakeProofId when present', () => {
    const { service } = setUp();
    const decision = service.createDecision({
      enforcementRequestId: 'r1',
      type: 'execute_allowed',
      reasonCode: 'OK',
      reason: 'ok',
      policyResults: [],
      recognitionResult: result({ type: 'allow', handshakeProofId: 'handshake-proof-1' }),
    });
    assert.equal(decision.handshakeProofId, 'handshake-proof-1');
  });

  it('13. defaults to blocked for an unknown recognition result', () => {
    const { service } = setUp();
    const mapped = service.mapRecognitionResult(undefined);
    assert.equal(mapped.decisionType, 'execution_blocked');
    assert.equal(mapped.reasonCode, 'RECOGNITION_MISSING');

    const malformed = service.mapRecognitionResult(result({ type: 'not_a_real_decision_type' }));
    assert.equal(malformed.decisionType, 'execution_blocked');
    assert.equal(malformed.reasonCode, 'RECOGNITION_INVALID');
  });
});
