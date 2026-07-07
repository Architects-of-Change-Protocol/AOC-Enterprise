import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyProofDetail } from '../components/policy-packs/PolicyProofDetail.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('PolicyProofDetail', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('1. renders policy proof hash', () => {
    const proof = model.policyPacks.proofs[0]!;
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof} />);
    assert.ok(html.includes(proof.proofHash.slice(0, 16)));
  });

  it('2. renders input hash', () => {
    const proof = model.policyPacks.proofs[0]!;
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof} />);
    assert.ok(html.includes(proof.inputHash.slice(0, 16)));
  });

  it('3. renders rule results hash', () => {
    const proof = model.policyPacks.proofs[0]!;
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof} />);
    assert.ok(html.includes(proof.ruleResultsHash.slice(0, 16)));
  });

  it('4. renders decision hash', () => {
    const proof = model.policyPacks.proofs[0]!;
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof} />);
    assert.ok(html.includes(proof.decisionHash.slice(0, 16)));
  });

  it('5. renders previous hash when present', () => {
    const proof = model.policyPacks.proofs.find((p) => p.previousHash !== undefined);
    assert.ok(proof);
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof!} />);
    assert.ok(html.includes(proof!.previousHash!.slice(0, 16)));
  });

  it('6. renders policy pack version IDs', () => {
    const proof = model.policyPacks.proofs.find((p) => p.policyPackVersionIds.length > 0);
    assert.ok(proof);
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof!} />);
    assert.ok(html.includes(proof!.policyPackVersionIds[0]!));
  });

  it('7. renders matched rule IDs', () => {
    const proof = model.policyPacks.proofs.find((p) => p.matchedRuleIds.length > 0);
    assert.ok(proof);
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof!} />);
    assert.ok(html.includes(proof!.matchedRuleIds[0]!));
  });

  it('8. renders linked enforcement proof when present', () => {
    const proof = model.policyPacks.proofs[0]!;
    const enforcementProof = model.enforcement.proofs.find((p) => p.policyProofId === proof.id);
    assert.ok(enforcementProof);
    const html = renderToStaticMarkup(<PolicyProofDetail proof={proof} linkedEnforcementProofId={enforcementProof!.id} />);
    assert.ok(html.includes(enforcementProof!.id));
  });
});
