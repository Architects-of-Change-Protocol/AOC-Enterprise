import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AocEnterpriseDemoPage } from '../../components/AocEnterpriseDemoPage.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenario } from '../../domain/demo-scenario.js';
import type { DemoScenarioRun } from '../../domain/demo-step.js';

describe('AocEnterpriseDemoPage', () => {
  let scenarios: readonly DemoScenario[];
  let run: DemoScenarioRun;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    scenarios = suite.registry.listScenarios();
    run = await suite.runner.runScenario('internal-agent-allowed');
  });

  it('renders the page title', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={scenarios} />);
    assert.ok(html.includes('Soberanía Enterprise Demo Scenario Pack'));
  });

  it('renders the subtitle', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={scenarios} />);
    assert.ok(html.includes('Deterministic enterprise scenarios for governed autonomous execution'));
  });

  it('renders the scenario selector', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={scenarios} />);
    assert.ok(html.includes('Internal Agent Allowed'));
    assert.ok(html.includes('Approval Required'));
  });

  it('renders the default scenario detail', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={scenarios} selectedScenarioId="internal-agent-allowed" />);
    assert.ok(html.includes('Internal Agent Allowed to Draft Closure Email'));
  });

  it('renders the outcome panel when a run is provided', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={scenarios} selectedScenarioId="internal-agent-allowed" run={run} />);
    assert.ok(html.includes('executed'));
  });

  it('renders the export panel', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={scenarios} selectedScenarioId="internal-agent-allowed" run={run} />);
    assert.ok(html.includes('JSON summary'));
  });

  it('renders an empty state when no scenarios are registered', () => {
    const html = renderToStaticMarkup(<AocEnterpriseDemoPage scenarios={[]} />);
    assert.ok(html.includes('Select a scenario'));
  });
});
