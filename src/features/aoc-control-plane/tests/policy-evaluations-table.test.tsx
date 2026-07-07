import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyEvaluationsTable } from '../components/policy-packs/PolicyEvaluationsTable.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('PolicyEvaluationsTable', () => {
  let model: AocControlPlaneReadModel;
  let html: string;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    html = renderToStaticMarkup(<PolicyEvaluationsTable evaluations={model.policyPacks.evaluations} />);
  });

  it('1. renders evaluation actor/action/scope', () => {
    const evaluation = model.policyPacks.evaluations[0]!;
    assert.ok(html.includes(evaluation.actorId));
    assert.ok(html.includes(evaluation.action));
    assert.ok(html.includes(evaluation.resourceScope));
  });

  it('2. renders decision', () => {
    const evaluation = model.policyPacks.evaluations[0]!;
    assert.ok(html.includes(evaluation.decisionType.replace(/_/g, ' ')));
  });

  it('3. renders effective risk', () => {
    const evaluation = model.policyPacks.evaluations[0]!;
    assert.ok(html.includes(evaluation.effectiveRiskLevel));
  });

  it('4. renders matched rules', () => {
    const withMatches = model.policyPacks.evaluations.find((evaluation) => evaluation.matchedRuleIds.length > 0);
    assert.ok(withMatches);
    assert.ok(html.includes(withMatches!.matchedRuleIds[0]!));
  });

  it('5. renders proof hash/link', () => {
    const withProof = model.policyPacks.evaluations.find((evaluation) => evaluation.policyProofHash !== undefined);
    assert.ok(withProof);
    assert.ok(html.includes(withProof!.policyProofHash!.slice(0, 12)));
  });
});
