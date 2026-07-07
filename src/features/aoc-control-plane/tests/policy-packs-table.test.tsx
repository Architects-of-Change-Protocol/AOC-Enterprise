import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyPacksTable } from '../components/policy-packs/PolicyPacksTable.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('PolicyPacksTable', () => {
  let model: AocControlPlaneReadModel;
  let html: string;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    html = renderToStaticMarkup(<PolicyPacksTable packs={model.policyPacks.packs} />);
  });

  it('1. renders pack name', () => {
    assert.ok(html.includes(model.policyPacks.packs[0]!.name));
  });

  it('2. renders kind', () => {
    assert.ok(html.includes(model.policyPacks.packs[0]!.kind));
  });

  it('3. renders domain', () => {
    assert.ok(html.includes(model.policyPacks.packs[0]!.domain));
  });

  it('4. renders status', () => {
    assert.ok(html.includes(model.policyPacks.packs[0]!.status));
  });

  it('5. renders current version', () => {
    assert.ok(html.includes(model.policyPacks.packs[0]!.currentVersionId));
  });

  it('6. renders legal completeness', () => {
    assert.ok(html.includes('Not legal advice'));
  });

  it('7. renders demo-only label', () => {
    assert.ok(html.includes('demo only'));
  });
});
