import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoPolicyPackScenarioPanel } from '../../components/DemoPolicyPackScenarioPanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenario } from '../../domain/demo-scenario.js';
import type { DemoScenarioOutcome } from '../../domain/demo-outcome.js';

describe('DemoPolicyPackScenarioPanel', () => {
  let scenario: DemoScenario;
  let outcome: DemoScenarioOutcome;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    scenario = run.scenario;
    outcome = run.outcome!;
  });

  it('renders the scenario title', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackScenarioPanel scenario={scenario} outcome={outcome} />);
    assert.ok(html.includes(scenario.title));
  });

  it('renders buyer pain', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackScenarioPanel scenario={scenario} outcome={outcome} />);
    assert.ok(html.includes(scenario.buyerPain));
  });

  it('renders AOC value', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackScenarioPanel scenario={scenario} outcome={outcome} />);
    assert.ok(html.includes(scenario.aocValue));
  });

  it('renders the policy pack version', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackScenarioPanel scenario={scenario} outcome={outcome} />);
    assert.ok(html.includes(outcome.policyPackVersionIds![0]!));
  });

  it('renders the expected policy result', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackScenarioPanel scenario={scenario} outcome={outcome} />);
    assert.ok(html.includes(scenario.expectedOutcome));
  });

  it('renders an empty state with no scenario', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackScenarioPanel />);
    assert.ok(html.includes('No policy-pack scenario is selected'));
  });
});
