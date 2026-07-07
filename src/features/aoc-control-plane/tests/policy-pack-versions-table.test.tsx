import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyPackVersionsTable } from '../components/policy-packs/PolicyPackVersionsTable.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('PolicyPackVersionsTable', () => {
  let model: AocControlPlaneReadModel;
  let html: string;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    html = renderToStaticMarkup(<PolicyPackVersionsTable versions={model.policyPacks.versions} />);
  });

  it('1. renders version', () => {
    assert.ok(html.includes(model.policyPacks.versions[0]!.version));
  });

  it('2. renders status', () => {
    assert.ok(html.includes(model.policyPacks.versions[0]!.status));
  });

  it('3. renders effective dates', () => {
    assert.ok(html.includes(model.policyPacks.versions[0]!.effectiveFrom));
  });

  it('4. renders scope summary', () => {
    assert.ok(html.includes(model.policyPacks.versions[0]!.scopeSummary));
  });

  it('5. renders demo-only', () => {
    assert.ok(html.includes('demo only'));
  });

  it('6. renders not legal advice', () => {
    assert.ok(html.includes('Not legal advice'));
  });
});
