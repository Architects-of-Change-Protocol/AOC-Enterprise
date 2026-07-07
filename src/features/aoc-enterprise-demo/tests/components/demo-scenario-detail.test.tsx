import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoScenarioDetail } from '../../components/DemoScenarioDetail.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenario } from '../../domain/demo-scenario.js';

describe('DemoScenarioDetail', () => {
  let scenario: DemoScenario;

  before(() => {
    const suite = createEnterpriseDemoSuite();
    scenario = suite.registry.getScenario('internal-agent-allowed')!;
  });

  it('renders the title', () => {
    const html = renderToStaticMarkup(<DemoScenarioDetail scenario={scenario} />);
    assert.ok(html.includes(scenario.title));
  });

  it('renders the buyer pain', () => {
    const html = renderToStaticMarkup(<DemoScenarioDetail scenario={scenario} />);
    assert.ok(html.includes('trust autonomous agents to act without proof'));
  });

  it('renders the AOC value', () => {
    const html = renderToStaticMarkup(<DemoScenarioDetail scenario={scenario} />);
    assert.ok(html.includes(scenario.aocValue));
  });

  it('renders personas', () => {
    const suite = createEnterpriseDemoSuite();
    const personas = suite.orchestrator.getPersonas();
    const html = renderToStaticMarkup(<DemoScenarioDetail scenario={scenario} personas={personas} />);
    assert.ok(html.includes('PMFreak Closure Agent'));
    assert.ok(html.includes('Victor Valverde'));
  });

  it('renders action, resource scope and risk level', () => {
    const html = renderToStaticMarkup(<DemoScenarioDetail scenario={scenario} />);
    assert.ok(html.includes(scenario.action));
    assert.ok(html.includes(scenario.resourceScope));
    assert.ok(html.includes(scenario.riskLevel));
  });
});
