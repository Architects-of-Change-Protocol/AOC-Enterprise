import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { AocOverviewDashboard } from '../components/AocOverviewDashboard.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('AocOverviewDashboard', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('renders metrics', () => {
    const html = renderToStaticMarkup(<AocOverviewDashboard overview={model.overview} timeline={model.timeline} />);
    assert.ok(html.includes('Recognized Actors'));
    assert.ok(html.includes('Pending Approvals'));
  });

  it('renders health', () => {
    const html = renderToStaticMarkup(<AocOverviewDashboard overview={model.overview} timeline={model.timeline} />);
    assert.ok(html.includes(model.overview.health.reason));
  });

  it('renders recent decisions', () => {
    const html = renderToStaticMarkup(<AocOverviewDashboard overview={model.overview} timeline={model.timeline} />);
    assert.ok(html.includes('Recent decisions'));
    assert.ok(model.overview.recentDecisions.length > 0);
  });

  it('renders open items', () => {
    const html = renderToStaticMarkup(<AocOverviewDashboard overview={model.overview} timeline={model.timeline} />);
    assert.ok(html.includes('Open items'));
    if (model.overview.openItems.length === 0) {
      assert.ok(html.includes('No open items'));
    } else {
      assert.ok(html.includes(model.overview.openItems[0]!.title));
    }
  });

  it('renders the activity timeline', () => {
    const html = renderToStaticMarkup(<AocOverviewDashboard overview={model.overview} timeline={model.timeline} />);
    assert.ok(html.includes('Recent activity'));
    assert.ok(html.includes(model.timeline[0]!.title));
  });
});
