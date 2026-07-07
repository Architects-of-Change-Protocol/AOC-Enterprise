import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapEnforcementRequestToItem,
  mapEnforcementDecisionToItem,
  mapEnforcementProofToItem,
  mapExecutionResultToItem,
  mapSideEffectToItem,
  mapEnforcementEventToItem,
} from '../../integrations/action-enforcement-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { EnforcementRequest } from '../../../action-enforcement/domain/enforcement-request.js';
import type { EnforcementDecision } from '../../../action-enforcement/domain/enforcement-decision.js';
import type { EnforcementProof } from '../../../action-enforcement/domain/enforcement-proof.js';
import type { ExecutionResult } from '../../../action-enforcement/domain/execution-result.js';
import type { SideEffectDescriptor } from '../../../action-enforcement/domain/side-effect.js';
import type { EnforcementEvent } from '../../../action-enforcement/domain/enforcement-event.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeRequest(overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  return {
    id: 'enforcement-request-1',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    target: { id: 'target-1', type: 'tool_call', name: 'send_payment_tool' },
    intent: { id: 'intent-1', action: 'send_payment', resourceScope: 'account:acct-1', riskLevel: 'high', sideEffectType: 'financial' },
    sideEffects: [],
    submittedAt: NOW,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<EnforcementDecision> = {}): EnforcementDecision {
  return {
    id: 'enforcement-decision-1',
    enforcementRequestId: 'enforcement-request-1',
    type: 'execute_allowed',
    allowedToExecute: true,
    reasonCode: 'ALLOWED',
    reason: 'All preflight checks passed.',
    policyDecisionId: 'policy-decision-1',
    approvalProofId: 'approval-proof-1',
    authorityProofId: 'authority-proof-1',
    decidedAt: NOW,
    policyResults: [],
    ...overrides,
  };
}

function makeProof(overrides: Partial<EnforcementProof> = {}): EnforcementProof {
  return {
    id: 'enforcement-proof-1',
    enforcementRequestId: 'enforcement-request-1',
    enforcementDecisionId: 'enforcement-decision-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'send_payment',
    resourceScope: 'account:acct-1',
    allowedToExecute: true,
    executed: true,
    sideEffectIds: ['side-effect-1'],
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

function makeExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    id: 'execution-result-1',
    enforcementRequestId: 'enforcement-request-1',
    enforcementDecisionId: 'enforcement-decision-1',
    status: 'executed',
    executed: true,
    ...overrides,
  };
}

function makeSideEffect(overrides: Partial<SideEffectDescriptor> = {}): SideEffectDescriptor {
  return {
    id: 'side-effect-1',
    enforcementRequestId: 'enforcement-request-1',
    type: 'financial',
    status: 'executed',
    plannedAt: NOW,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EnforcementEvent> = {}): EnforcementEvent {
  return {
    id: 'enforcement-event-1',
    type: 'execution_succeeded',
    trustDomainId: 'trust-domain-1',
    timestamp: NOW,
    payload: {},
    eventHash: 'event-hash-1',
    ...overrides,
  };
}

describe('action-enforcement-export-adapter', () => {
  it('1. mapEnforcementRequestToItem maps an EnforcementRequest to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const request = makeRequest();
    const item = mapEnforcementRequestToItem(ctx, request);

    assert.equal(item.type, 'enforcement_request');
    assert.equal(item.sourceModule, 'action_enforcement');
    assert.equal(item.sourceId, request.id);
    assert.equal(item.payload.mode, request.mode);
    assert.equal(item.payload.action, request.action);
  });

  it('2. mapEnforcementDecisionToItem preserves allowedToExecute, policyDecisionId, approvalProofId, and authorityProofId verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision();
    const item = mapEnforcementDecisionToItem(ctx, decision);

    assert.equal(item.type, 'enforcement_decision');
    assert.equal(item.sourceModule, 'action_enforcement');
    assert.equal(item.sourceId, decision.id);
    assert.equal(item.payload.allowedToExecute, true);
    assert.equal(item.payload.policyDecisionId, 'policy-decision-1');
    assert.equal(item.payload.approvalProofId, 'approval-proof-1');
    assert.equal(item.payload.authorityProofId, 'authority-proof-1');
  });

  it('3. mapEnforcementDecisionToItem preserves a blocked decision verbatim, never flipping allowedToExecute to true', () => {
    const ctx = createExportRuntimeContext(NOW);
    const decision = makeDecision({ type: 'execution_blocked', allowedToExecute: false, reasonCode: 'POLICY_DENIED', reason: 'Policy pack denied the action.' });
    const item = mapEnforcementDecisionToItem(ctx, decision);

    assert.equal(item.payload.allowedToExecute, false);
    assert.equal(item.payload.type, 'execution_blocked');
  });

  it('4. mapEnforcementProofToItem preserves executed and sideEffectIds verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ executed: true, sideEffectIds: ['side-effect-1', 'side-effect-2'] });
    const item = mapEnforcementProofToItem(ctx, proof);

    assert.equal(item.type, 'enforcement_proof');
    assert.equal(item.sourceModule, 'action_enforcement');
    assert.equal(item.sourceId, proof.id);
    assert.equal(item.payload.executed, true);
    assert.deepEqual(item.payload.sideEffectIds, ['side-effect-1', 'side-effect-2']);
  });

  it('5. mapExecutionResultToItem preserves status="not_executed" verbatim, demonstrating it does not re-run the executor', () => {
    const ctx = createExportRuntimeContext(NOW);
    const result = makeExecutionResult({ status: 'not_executed', executed: false });
    const item = mapExecutionResultToItem(ctx, result);

    assert.equal(item.type, 'execution_result');
    assert.equal(item.sourceModule, 'action_enforcement');
    assert.equal(item.sourceId, result.id);
    assert.equal(item.payload.status, 'not_executed');
  });

  it('6. mapExecutionResultToItem preserves status="executed" verbatim, demonstrating it does not re-run the executor', () => {
    const ctx = createExportRuntimeContext(NOW);
    const result = makeExecutionResult({ status: 'executed', executed: true });
    const item = mapExecutionResultToItem(ctx, result);

    assert.equal(item.payload.status, 'executed');
  });

  it('7. mapSideEffectToItem maps a SideEffectDescriptor to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const sideEffect = makeSideEffect();
    const item = mapSideEffectToItem(ctx, sideEffect);

    assert.equal(item.type, 'side_effect_result');
    assert.equal(item.sourceModule, 'action_enforcement');
    assert.equal(item.sourceId, sideEffect.id);
    assert.equal(item.payload.type, sideEffect.type);
    assert.equal(item.payload.status, sideEffect.status);
  });

  it('8. mapEnforcementEventToItem maps an EnforcementEvent to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const event = makeEvent();
    const item = mapEnforcementEventToItem(ctx, event);

    assert.equal(item.type, 'enforcement_event');
    assert.equal(item.sourceModule, 'action_enforcement');
    assert.equal(item.sourceId, event.id);
    assert.equal(item.payload.type, event.type);
  });
});
