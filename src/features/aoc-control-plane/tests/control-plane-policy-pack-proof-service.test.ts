import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { policyProofReferences, buildPolicyProofChains } from '../services/control-plane-policy-pack-proof-service.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('ControlPlanePolicyPackProofService', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('1. collects policy proof references', () => {
    const refs = policyProofReferences(model.policyPacks.proofs);
    assert.ok(refs.length > 0);
    assert.ok(refs.every((ref) => ref.source === 'policy'));
  });

  it('2. links policy proof to enforcement proof', () => {
    const policyProofsById = new Map(model.policyPacks.proofs.map((proof) => [proof.id, proof]));
    const chains = buildPolicyProofChains(model.enforcement.proofs, policyProofsById);
    assert.ok(chains.length > 0);
    for (const chain of chains) {
      assert.equal(chain.sources[0], 'enforcement');
      assert.equal(chain.sources[1], 'policy');
    }
  });

  it('3. creates enforcement -> policy proof chain', () => {
    const policyProofsById = new Map(model.policyPacks.proofs.map((proof) => [proof.id, proof]));
    const chains = buildPolicyProofChains(model.enforcement.proofs, policyProofsById);
    const enforcementProofWithPolicy = model.enforcement.proofs.find((proof) => proof.policyProofId !== undefined)!;
    const chain = chains.find((c) => c.proofIds[0] === enforcementProofWithPolicy.id);
    assert.ok(chain);
    assert.equal(chain!.proofIds[1], enforcementProofWithPolicy.policyProofId);
  });

  it('4. marks chain complete when policy proof exists', () => {
    const policyProofsById = new Map(model.policyPacks.proofs.map((proof) => [proof.id, proof]));
    const chains = buildPolicyProofChains(model.enforcement.proofs, policyProofsById);
    assert.ok(chains.length > 0);
    assert.ok(chains.every((chain) => chain.complete));
  });

  it('5. marks chain incomplete when enforcement references missing policy proof', () => {
    const enforcementProofWithPolicy = model.enforcement.proofs.find((proof) => proof.policyProofId !== undefined)!;
    const emptyPolicyProofsById = new Map<string, (typeof model.policyPacks.proofs)[number]>();
    const chains = buildPolicyProofChains([enforcementProofWithPolicy], emptyPolicyProofsById);
    assert.equal(chains.length, 1);
    assert.equal(chains[0]!.complete, false);
  });

  it('6. deterministic ordering', () => {
    const first = policyProofReferences(model.policyPacks.proofs);
    const second = policyProofReferences(model.policyPacks.proofs);
    assert.deepEqual(first, second);
    for (let i = 1; i < first.length; i++) {
      assert.ok(first[i - 1]!.createdAt <= first[i]!.createdAt);
    }
  });

  it('7. proof hash visible', () => {
    const refs = policyProofReferences(model.policyPacks.proofs);
    assert.ok(refs.every((ref) => ref.proofHash.length > 0));
  });
});
