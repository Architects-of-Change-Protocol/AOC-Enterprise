import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoScenarioSelector } from '../../components/DemoScenarioSelector.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenario } from '../../domain/demo-scenario.js';

describe('DemoScenarioSelector', () => {
  let scenarios: readonly DemoScenario[];

  before(() => {
    scenarios = createEnterpriseDemoSuite().registry.listScenarios();
  });

  it('renders all scenarios', () => {
    const html = renderToStaticMarkup(<DemoScenarioSelector scenarios={scenarios} />);
    for (const scenario of scenarios) {
      assert.ok(html.includes(scenario.shortTitle), `expected to find "${scenario.shortTitle}"`);
    }
  });

  it('renders category labels', () => {
    const html = renderToStaticMarkup(<DemoScenarioSelector scenarios={scenarios} />);
    assert.ok(html.includes('approval'));
    assert.ok(html.includes('enforcement'));
    assert.ok(html.includes('external_agents'));
  });

  it('renders expected outcome', () => {
    const html = renderToStaticMarkup(<DemoScenarioSelector scenarios={scenarios} />);
    assert.ok(html.includes('executed'));
    assert.ok(html.includes('approval_required'));
  });

  it('marks the selected scenario', () => {
    const html = renderToStaticMarkup(<DemoScenarioSelector scenarios={scenarios} selectedScenarioId="approval-required-block" />);
    assert.ok(html.includes('aoc-demo-scenario-selector__item--selected'));
    assert.ok(html.includes('aria-pressed="true"'));
  });

  it('renders an empty state with no scenarios', () => {
    const html = renderToStaticMarkup(<DemoScenarioSelector scenarios={[]} />);
    assert.ok(html.includes('No demo scenarios are registered.'));
  });
});
