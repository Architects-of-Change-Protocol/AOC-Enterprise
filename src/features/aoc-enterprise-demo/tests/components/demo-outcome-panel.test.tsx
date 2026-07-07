import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoOutcomePanel } from '../../components/DemoOutcomePanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenarioOutcome } from '../../domain/demo-outcome.js';

describe('DemoOutcomePanel', () => {
  let executedOutcome: DemoScenarioOutcome;
  let blockedOutcome: DemoScenarioOutcome;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    executedOutcome = (await suite.runner.runScenario('internal-agent-allowed')).outcome!;
    blockedOutcome = (await suite.runner.runScenario('approval-required-block')).outcome!;
  });

  it('renders an executed outcome', () => {
    const html = renderToStaticMarkup(<DemoOutcomePanel outcome={executedOutcome} />);
    assert.ok(html.includes('executed'));
    assert.ok(html.includes('true'));
  });

  it('renders a blocked (approval_required) outcome', () => {
    const html = renderToStaticMarkup(<DemoOutcomePanel outcome={blockedOutcome} />);
    assert.ok(html.includes('approval_required'));
  });

  it('renders executorRan', () => {
    const html = renderToStaticMarkup(<DemoOutcomePanel outcome={blockedOutcome} />);
    assert.ok(html.includes('Executor ran'));
    assert.ok(html.includes('false'));
  });

  it('renders sideEffectsExecuted', () => {
    const html = renderToStaticMarkup(<DemoOutcomePanel outcome={executedOutcome} />);
    assert.ok(html.includes('Side effects executed'));
  });

  it('renders the reason code', () => {
    const html = renderToStaticMarkup(<DemoOutcomePanel outcome={executedOutcome} />);
    assert.ok(html.includes(executedOutcome.reasonCode));
  });

  it('renders an empty state with no outcome', () => {
    const html = renderToStaticMarkup(<DemoOutcomePanel />);
    assert.ok(html.includes('has not produced an outcome yet'));
  });
});
