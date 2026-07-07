import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyPackDecision } from '../domain/policy-pack-decision.js';
import type { PolicyEvaluationInput, PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import { createPolicyPackRuntimeContext } from '../runtime/policy-pack-runtime-context.js';
import { PolicyPackStore } from '../services/policy-pack-store.js';
import { PolicyPackProofService, type CreatePolicyPackProofInput } from '../services/policy-pack-proof-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildEvaluationInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return {
    id: 'input-1',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'scope-1',
    riskLevel: 'low',
    requestedAt: NOW,
    ...overrides,
  };
}

function buildDecision(overrides: Partial<PolicyPackDecision> = {}): PolicyPackDecision {
  return {
    id: 'decision-1',
    inputId: 'input-1',
    type: 'allowed',
    allowed: true,
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'scope-1',
    riskLevel: 'low',
    effectiveRiskLevel: 'low',
    applicablePackVersionIds: ['pack-1-v1'],
    matchedRuleIds: ['rule-1'],
    obligations: [],
    evidenceRequirements: [],
    approvalRequirements: [],
    reasonCode: 'OK',
    reason: 'ok',
    decidedAt: NOW,
    ...overrides,
  };
}

function buildProofInput(overrides: Partial<CreatePolicyPackProofInput> = {}): CreatePolicyPackProofInput {
  return {
    evaluationId: 'evaluation-1',
    input: buildEvaluationInput(),
    ruleResults: [] as readonly PolicyRuleEvaluationResult[],
    decision: buildDecision(),
    policyPackVersionIds: ['pack-1-v1'],
    matchedRuleIds: ['rule-1'],
    ...overrides,
  };
}

function setUp() {
  const ctx = createPolicyPackRuntimeContext(NOW);
  const store = new PolicyPackStore();
  return { service: new PolicyPackProofService(ctx, store), store };
}

describe('PolicyPackProofService', () => {
  it('1. proof hash deterministic', () => {
    const { service } = setUp();
    const proof = service.createProof(buildProofInput());
    assert.ok(proof.proofHash);
    assert.equal(service.verifyProof(proof), true);
  });

  it('2. same input produces same proof hash', () => {
    const a = setUp().service.createProof(buildProofInput());
    const b = setUp().service.createProof(buildProofInput());
    assert.equal(a.proofHash, b.proofHash);
  });

  it('3. changing input changes hash', () => {
    const { service } = setUp();
    const a = service.createProof(buildProofInput());
    const b = service.createProof(buildProofInput({ input: buildEvaluationInput({ action: 'other_action' }), evaluationId: 'evaluation-2' }));
    assert.notEqual(a.proofHash, b.proofHash);
  });

  it('4. changing rule result changes hash', () => {
    const { service } = setUp();
    const a = service.createProof(buildProofInput());
    const ruleResult: PolicyRuleEvaluationResult = {
      policyPackId: 'pack-1',
      policyPackVersionId: 'pack-1-v1',
      ruleId: 'rule-1',
      matched: true,
      effectType: 'allow',
      severity: 'info',
      reasonCode: 'OK',
      reason: 'ok',
      obligations: [],
      evidenceRequirements: [],
      approvalRequirements: [],
    };
    const b = service.createProof(buildProofInput({ ruleResults: [ruleResult], evaluationId: 'evaluation-2' }));
    assert.notEqual(a.proofHash, b.proofHash);
  });

  it('5. changing decision changes hash', () => {
    const { service } = setUp();
    const a = service.createProof(buildProofInput());
    const b = service.createProof(buildProofInput({ decision: buildDecision({ type: 'denied', allowed: false }), evaluationId: 'evaluation-2' }));
    assert.notEqual(a.proofHash, b.proofHash);
  });

  it('6. changing policy pack version changes hash', () => {
    const { service } = setUp();
    const a = service.createProof(buildProofInput());
    const b = service.createProof(buildProofInput({ policyPackVersionIds: ['pack-1-v2'], evaluationId: 'evaluation-2' }));
    assert.notEqual(a.proofHash, b.proofHash);
  });

  it('7. maintains previousHash chain', () => {
    const { service } = setUp();
    const a = service.createProof(buildProofInput());
    const b = service.createProof(buildProofInput({ evaluationId: 'evaluation-2' }));
    assert.equal(b.previousHash, a.proofHash);
    assert.equal(a.previousHash, undefined);
  });

  it('8. verifies proof', () => {
    const { service } = setUp();
    const proof = service.createProof(buildProofInput());
    assert.equal(service.verifyProof(proof), true);
    assert.equal(service.verifyProof({ ...proof, proofHash: 'tampered' }), false);
  });
});
