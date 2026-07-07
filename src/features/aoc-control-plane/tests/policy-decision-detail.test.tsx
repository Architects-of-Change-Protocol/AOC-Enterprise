import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyDecisionDetail } from '../components/policy-packs/PolicyDecisionDetail.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import type { PolicyDecisionRow } from '../domain/policy-pack-view-model.js';

function findDecision(model: AocControlPlaneReadModel, type: string): PolicyDecisionRow {
  const decision = model.policyPacks.decisions.find((d) => d.type === type);
  assert.ok(decision, `expected a policy decision of type ${type}`);
  return decision!;
}

describe('PolicyDecisionDetail', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('1. renders decision ID', () => {
    const decision = findDecision(model, 'denied');
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes(decision.id));
  });

  it('2. renders allowed decision', () => {
    const decision = findDecision(model, 'warning');
    assert.equal(decision.allowed, true);
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes('Yes'));
  });

  it('3. renders denied decision', () => {
    const decision = findDecision(model, 'denied');
    assert.equal(decision.allowed, false);
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes('denied'));
  });

  it('4. renders requires evidence', () => {
    const decision = findDecision(model, 'requires_evidence');
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes('requires evidence'));
  });

  it('5. renders requires approval', () => {
    const decision = findDecision(model, 'requires_approval');
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes('requires approval'));
  });

  it('6. renders obligations', () => {
    const decision = model.policyPacks.decisions.find((d) => d.obligations.length > 0);
    assert.ok(decision);
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision!} />);
    assert.ok(html.includes(decision!.obligations[0]!.description));
  });

  it('7. renders evidence requirements', () => {
    const decision = findDecision(model, 'requires_evidence');
    assert.ok(decision.evidenceRequirements.length > 0);
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes(decision.evidenceRequirements[0]!.description));
  });

  it('8. renders approval requirements', () => {
    const decision = findDecision(model, 'requires_approval');
    assert.ok(decision.approvalRequirements.length > 0);
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes(decision.approvalRequirements[0]!.description));
  });

  it('9. renders matched rules', () => {
    const decision = model.policyPacks.decisions.find((d) => d.matchedRuleIds.length > 0);
    assert.ok(decision);
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision!} />);
    assert.ok(html.includes(decision!.matchedRuleIds[0]!));
  });

  it('10. renders reasonCode/reason', () => {
    const decision = findDecision(model, 'denied');
    const html = renderToStaticMarkup(<PolicyDecisionDetail decision={decision} />);
    assert.ok(html.includes(decision.reasonCode));
    assert.ok(html.includes(decision.reason));
  });
});
