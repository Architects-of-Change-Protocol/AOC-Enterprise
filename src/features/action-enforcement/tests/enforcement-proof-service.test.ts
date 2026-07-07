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
    action: 'draft_closure_email',
    resourceScope: 'project:1',
    allowedToExecute: true,
    executed: true,
    sideEffectIds: ['side-effect-1'],
    ...overrides,
  };
}

describe('EnforcementProofService', () => {
  it('1. the proof hash is deterministic', () => {
    const serviceA = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const serviceB = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    assert.equal(serviceA.createProof(baseInput()).proofHash, serviceB.createProof(baseInput()).proofHash);
  });

  it('2. identical inputs produce identical proof hashes', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofA = service.createProof(baseInput({ enforcementDecisionId: 'd1' }));
    const service2 = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofB = service2.createProof(baseInput({ enforcementDecisionId: 'd1' }));
    assert.equal(proofA.proofHash, proofB.proofHash);
  });

  it('3. changing the decision changes the proof hash', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofA = service.createProof(baseInput({ enforcementDecisionId: 'd1' }));
    const service2 = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofB = service2.createProof(baseInput({ enforcementDecisionId: 'd2' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('4. changing the execution result changes the proof hash', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofA = service.createProof(baseInput({ executionResultId: 'res-1' }));
    const service2 = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofB = service2.createProof(baseInput({ executionResultId: 'res-2' }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('5. changing the side effect IDs changes the proof hash', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofA = service.createProof(baseInput({ sideEffectIds: ['side-effect-1'] }));
    const service2 = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proofB = service2.createProof(baseInput({ sideEffectIds: ['side-effect-1', 'side-effect-2'] }));
    assert.notEqual(proofA.proofHash, proofB.proofHash);
  });

  it('6. the proof includes recognitionDecisionId when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ recognitionDecisionId: 'recognition-decision-1' }));
    assert.equal(proof.recognitionDecisionId, 'recognition-decision-1');
  });

  it('7. the proof includes authorityProofId when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ authorityProofId: 'authority-proof-1' }));
    assert.equal(proof.authorityProofId, 'authority-proof-1');
  });

  it('8. the proof includes approvalProofId when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ approvalProofId: 'approval-proof-1' }));
    assert.equal(proof.approvalProofId, 'approval-proof-1');
  });

  it('9. the proof includes handshakeProofId when available', () => {
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), new EnforcementStore());
    const proof = service.createProof(baseInput({ handshakeProofId: 'handshake-proof-1' }));
    assert.equal(proof.handshakeProofId, 'handshake-proof-1');
  });

  it('10. the proof ledger maintains a previousHash/proofHash chain', () => {
    const store = new EnforcementStore();
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), store);
    const first = service.createProof(baseInput({ enforcementDecisionId: 'd1' }));
    const second = service.createProof(baseInput({ enforcementDecisionId: 'd2' }));
    assert.equal(second.previousHash, first.proofHash);
    assert.equal(first.previousHash, undefined);
  });

  it('11. the proof can be exported by enforcementDecisionId', () => {
    const store = new EnforcementStore();
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), store);
    const proof = service.createProof(baseInput({ enforcementDecisionId: 'd42' }));
    assert.deepEqual(service.getProofByDecisionId('d42'), proof);
  });

  it('12. a proof can be verified deterministically', () => {
    const store = new EnforcementStore();
    const service = new EnforcementProofService(createEnforcementRuntimeContext(NOW), store);
    const proof = service.createProof(baseInput());
    assert.equal(service.verifyProof(proof), true);
    assert.equal(service.verifyProof({ ...proof, executed: false }), false);
  });
});
