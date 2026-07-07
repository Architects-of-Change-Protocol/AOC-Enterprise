import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyPackSummaryCards } from '../components/policy-packs/PolicyPackSummaryCards.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('PolicyPackSummaryCards', () => {
  let model: AocControlPlaneReadModel;
  let html: string;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    html = renderToStaticMarkup(<PolicyPackSummaryCards metrics={model.policyPacks.metrics} />);
  });

  it('1. renders Policy Packs count', () => {
    assert.ok(html.includes('Policy Packs'));
  });

  it('2. renders Active Versions count', () => {
    assert.ok(html.includes('Active Versions'));
  });

  it('3. renders Demo-only Versions count', () => {
    assert.ok(html.includes('Demo-only Versions'));
  });

  it('4. renders Denied Decisions count', () => {
    assert.ok(html.includes('Denied Decisions'));
  });

  it('5. renders Approval Required count', () => {
    assert.ok(html.includes('Approval Required'));
  });

  it('6. renders Evidence Required count', () => {
    assert.ok(html.includes('Evidence Required'));
  });

  it('7. renders Policy Proofs count', () => {
    assert.ok(html.includes('Policy Proofs'));
  });

  it('8. renders Policy-blocked Executions count', () => {
    assert.ok(html.includes('Policy-blocked Executions'));
  });
});
