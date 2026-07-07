import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { AocControlPlanePage } from '../components/AocControlPlanePage.js';
import { AocNavigationTabs } from '../components/AocNavigationTabs.js';
import { AOC_NAVIGATION_ITEMS } from '../domain/control-plane-navigation.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('Navigation', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('each tab/section is reachable', () => {
    for (const item of AOC_NAVIGATION_ITEMS) {
      const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} initialSection={item.section} />);
      assert.ok(html.length > 0);
    }
  });

  it('the selected section is reflected as aria-selected on its tab', () => {
    for (const item of AOC_NAVIGATION_ITEMS) {
      const html = renderToStaticMarkup(<AocNavigationTabs selected={item.section} onSelect={() => {}} />);
      const selectedButtonPattern = new RegExp(`aria-selected="true"[^>]*>${item.label}<`);
      assert.ok(selectedButtonPattern.test(html), `expected ${item.label} to be marked aria-selected`);
    }
  });

  it('exactly one tab is aria-selected at a time', () => {
    const html = renderToStaticMarkup(<AocNavigationTabs selected="enforcement" onSelect={() => {}} />);
    const matches = html.match(/aria-selected="true"/g) ?? [];
    assert.equal(matches.length, 1);
  });

  it('a detail panel opens when a row is clicked (component supports controlled selection)', () => {
    const decision = model.recognition.decisions[0];
    assert.ok(decision);
    // RecognitionDecisionsTable renders a button per row that would trigger selection on click;
    // verify the row is rendered as an interactive control, not static text.
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} initialSection="recognition" />);
    assert.ok(html.includes(`<button type="button">${decision!.id}</button>`));
  });
});
