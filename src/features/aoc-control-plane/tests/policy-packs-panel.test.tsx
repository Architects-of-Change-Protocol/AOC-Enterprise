import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyPacksPanel } from '../components/policy-packs/PolicyPacksPanel.js';
import { EMPTY_POLICY_PACK_VIEW_MODEL } from '../domain/policy-pack-view-model.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('PolicyPacksPanel', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('1. renders Policy Packs section title', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes('<h2>Policy Packs</h2>'));
  });

  it('2. renders summary cards', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes('Policy Packs'));
    assert.ok(html.includes('Active Versions'));
  });

  it('3. renders policy packs table', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes(model.policyPacks.packs[0]!.name));
  });

  it('4. renders versions table', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes(model.policyPacks.versions[0]!.version));
  });

  it('5. renders rules table', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes(model.policyPacks.rules[0]!.name));
  });

  it('6. renders evaluations table', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes(model.policyPacks.evaluations[0]!.action));
  });

  it('7. renders events table', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes('policy_pack_registered'));
  });

  it('8. renders empty state when no data', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={EMPTY_POLICY_PACK_VIEW_MODEL} />);
    assert.ok(html.includes('No Domain Policy Pack Runtime data is available'));
  });

  it('9. renders not legal advice badge', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes('Not legal advice'));
  });

  it('10. renders demo-only badge', () => {
    const html = renderToStaticMarkup(<PolicyPacksPanel policyPacks={model.policyPacks} />);
    assert.ok(html.includes('demo only'));
  });
});
