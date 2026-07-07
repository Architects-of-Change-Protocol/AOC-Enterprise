import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildControlPlaneDemoFixture, type ControlPlaneRuntimeBundle } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { buildProofsViewModel } from '../services/control-plane-proof-service.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('ControlPlaneProofService', () => {
  let bundle: ControlPlaneRuntimeBundle;
  let model: AocControlPlaneReadModel;

  before(async () => {
    bundle = await buildControlPlaneDemoFixture();
    model = buildControlPlaneReadModel(bundle);
  });

  it('collects recognition proof references', () => {
    assert.ok(model.proofs.recognitionProofs.length > 0);
    assert.ok(model.proofs.recognitionProofs.every((proof) => proof.source === 'recognition'));
  });

  it('collects authority proof references', () => {
    assert.ok(model.proofs.authorityProofs.length > 0);
    assert.ok(model.proofs.authorityProofs.every((proof) => proof.source === 'authority'));
  });

  it('collects approval proof references', () => {
    assert.ok(model.proofs.approvalProofs.length > 0);
    assert.ok(model.proofs.approvalProofs.every((proof) => proof.source === 'approval'));
  });

  it('collects handshake proof references', () => {
    assert.ok(model.proofs.handshakeProofs.length > 0);
    assert.ok(model.proofs.handshakeProofs.every((proof) => proof.source === 'handshake'));
  });

  it('collects enforcement proof references', () => {
    assert.ok(model.proofs.enforcementProofs.length > 0);
    assert.ok(model.proofs.enforcementProofs.every((proof) => proof.source === 'enforcement'));
  });

  it('builds proof chains that reference multiple sources', () => {
    assert.ok(model.proofs.proofChains.length > 0);
    const multiSourceChain = model.proofs.proofChains.find((chain) => chain.sources.length > 1);
    assert.ok(multiSourceChain, 'expected at least one chain spanning more than one source');
  });

  it('detects a complete proof chain', () => {
    assert.ok(model.proofs.proofChains.some((chain) => chain.complete));
  });

  it('detects an incomplete proof chain', () => {
    const incomplete = buildProofsViewModel({
      recognition: model.recognition,
      authority: { grants: [], delegations: [], roleAssignments: [], decisions: [], proofs: [] },
      approvals: model.approvals,
      enforcement: model.enforcement,
      handshakeProofs: [],
    });
    assert.ok(incomplete.proofChains.some((chain) => !chain.complete), 'removing authority proofs should break at least one chain');
  });

  it('sorts proof references deterministically', () => {
    const first = buildProofsViewModel({
      recognition: model.recognition,
      authority: model.authority,
      approvals: model.approvals,
      enforcement: model.enforcement,
      handshakeProofs: [],
    });
    const second = buildProofsViewModel({
      recognition: model.recognition,
      authority: model.authority,
      approvals: model.approvals,
      enforcement: model.enforcement,
      handshakeProofs: [],
    });
    assert.deepEqual(first, second);
  });
});
