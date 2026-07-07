import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CreateEnforcementProofInput } from '../services/enforcement-proof-service.js';
import { EnforcementProofService } from '../services/enforcement-proof-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

function baseInput(overrides: Partial<CreateEnforcementProofInput> = {}): CreateEnforcementProofInput {
  return {
    enforcementRequestId: 'r1',
    enforcementDecisionId: 'd1',
    trustDomainId: 'td1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'project:1',
    allowedToExecute: false,
    executed: false,
    sideEffectIds: [],
    ...overrides,
  };
}

describe('EnforcementProof <-> Domain Policy Pack Runtime wiring', () => {
  it('1. the proof includes policyDecisionId when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ policyDecisionId: 'policy-decision-1' }));
    assert.equal(proof.policyDecisionId, 'policy-decision-1');
  });

  it('2. the proof includes policyProofId when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ policyProofId: 'policy-proof-1' }));
    assert.equal(proof.policyProofId, 'policy-proof-1');
  });

  it('3. the proof includes policyPackVersionIds when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ policyPackVersionIds: ['pack-version-1'] }));
    assert.deepEqual(proof.policyPackVersionIds, ['pack-version-1']);
  });

  it('4. the proof includes policyMatchedRuleIds when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ policyMatchedRuleIds: ['rule-1', 'rule-2'] }));
    assert.deepEqual(proof.policyMatchedRuleIds, ['rule-1', 'rule-2']);
  });

  it('5. the same policy result produces a deterministic proof hash', () => {
    const serviceA = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const serviceB = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const input = baseInput({ policyDecisionId: 'policy-decision-1', policyProofId: 'policy-proof-1', policyPackVersionIds: ['v1'], policyMatchedRuleIds: ['r1'] });
    assert.equal(serviceA.createProof(input).proofHash, serviceB.createProof(input).proofHash);
  });

  it('6. changing policyDecisionId changes the proof hash', () => {
    const proofA = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyDecisionId: 'policy-decision-1' }));
    const proofB = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyDecisionId: 'policy-decision-2' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('7. changing policyProofId changes the proof hash', () => {
    const proofA = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyProofId: 'policy-proof-1' }));
    const proofB = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyProofId: 'policy-proof-2' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('8. changing policyPackVersionIds changes the proof hash', () => {
    const proofA = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyPackVersionIds: ['v1'] }));
    const proofB = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyPackVersionIds: ['v2'] }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('9. changing policyMatchedRuleIds changes the proof hash', () => {
    const proofA = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyMatchedRuleIds: ['r1'] }));
    const proofB = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore()).createProof(baseInput({ policyMatchedRuleIds: ['r1', 'r2'] }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('10. a proof carrying policy references still verifies deterministically', () => {
    const store = new EnforcementStore();
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), store);
    const proof = service.createProof(baseInput({ policyDecisionId: 'policy-decision-1', policyProofId: 'policy-proof-1' }));
    assert.equal(service.verifyProof(proof), true);
    assert.equal(service.verifyProof({ ...proof, policyDecisionId: 'tampered' }), false);
  });

  it('11. omitting policy fields leaves the proof unchanged from pre-policy-pack behavior', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput());
    assert.equal(proof.policyDecisionId, undefined);
    assert.equal(proof.policyProofId, undefined);
    assert.equal(proof.policyPackVersionIds, undefined);
    assert.equal(proof.policyMatchedRuleIds, undefined);
  });
});
