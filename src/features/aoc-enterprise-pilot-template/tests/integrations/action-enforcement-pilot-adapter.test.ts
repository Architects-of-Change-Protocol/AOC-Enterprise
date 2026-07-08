import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnforcementDecision } from '../../../action-enforcement/domain/enforcement-decision.js';
import type { EnforcementProof } from '../../../action-enforcement/domain/enforcement-proof.js';
import { summarizeEnforcementDecision, pilotExpectationMatchesEnforcementDecision } from '../../integrations/action-enforcement-pilot-adapter.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildDecision(overrides: Partial<EnforcementDecision> = {}): EnforcementDecision {
  return {
    id: 'enforcement-decision-1',
    enforcementRequestId: 'enforcement-request-1',
    type: 'execute_allowed',
    allowedToExecute: true,
    reasonCode: 'OK',
    reason: 'allowed',
    decidedAt: NOW,
    policyResults: [],
    ...overrides,
  };
}

function buildProof(overrides: Partial<EnforcementProof> = {}): EnforcementProof {
  return {
    id: 'enforcement-proof-1',
    enforcementRequestId: 'enforcement-request-1',
    enforcementDecisionId: 'enforcement-decision-1',
    trustDomainId: 'trust-domain-test',
    actorId: 'actor-1',
    action: 'read_project_summary',
    resourceScope: 'project:x',
    allowedToExecute: true,
    executed: true,
    sideEffectIds: [],
    proofHash: 'hash',
    createdAt: NOW,
    ...overrides,
  };
}

describe('action-enforcement-pilot-adapter', () => {
  it('1. maps enforcement decision', () => {
    const decision = buildDecision();
    const summary = summarizeEnforcementDecision(decision);
    assert.equal(summary.enforcementDecisionId, decision.id);
    assert.equal(summary.decisionType, decision.type);
    assert.equal(summary.allowedToExecute, true);
  });

  it('2. maps enforcement proof', () => {
    const decision = buildDecision();
    const proof = buildProof();
    const summary = summarizeEnforcementDecision(decision, proof);
    assert.equal(summary.enforcementProofId, proof.id);
  });

  it('3. preserves policyDecisionId', () => {
    const decision = buildDecision({ policyDecisionId: 'policy-decision-1' });
    const summary = summarizeEnforcementDecision(decision);
    assert.equal(summary.policyDecisionId, 'policy-decision-1');
  });

  it('4. preserves policyProofId', () => {
    const decision = buildDecision({ policyDecisionId: 'policy-decision-1', policyProofId: 'policy-proof-1' });
    const summary = summarizeEnforcementDecision(decision);
    assert.equal(summary.policyProofId, 'policy-proof-1');
  });

  it('5. preserves evidenceProofId when available', () => {
    const decision = buildDecision();
    const summary = summarizeEnforcementDecision(decision, undefined, 'evidence-proof-1');
    assert.equal(summary.evidenceProofId, 'evidence-proof-1');
  });

  it('6. does not rerun execution (pure mapping only)', () => {
    const decision = buildDecision({ type: 'approval_required', allowedToExecute: false });
    assert.equal(pilotExpectationMatchesEnforcementDecision('approval_required', decision), true);
    assert.equal(pilotExpectationMatchesEnforcementDecision('execute_allowed', decision), false);
  });
});
