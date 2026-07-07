import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoPolicyPackOutcomePanel } from '../../components/DemoPolicyPackOutcomePanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenarioOutcome } from '../../domain/demo-outcome.js';

describe('DemoPolicyPackOutcomePanel', () => {
  let blockedOutcome: DemoScenarioOutcome;
  let allowedOutcome: DemoScenarioOutcome;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    blockedOutcome = (await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied')).outcome!;
    allowedOutcome = (await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed')).outcome!;
  });

  it('renders the policy decision id', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackOutcomePanel outcome={blockedOutcome} />);
    assert.ok(html.includes(blockedOutcome.policyDecisionId!));
  });

  it('renders the policy proof id', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackOutcomePanel outcome={blockedOutcome} />);
    assert.ok(html.includes(blockedOutcome.policyProofId!));
  });

  it('renders matched rules', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackOutcomePanel outcome={blockedOutcome} />);
    assert.ok(html.includes(blockedOutcome.policyMatchedRuleIds![0]!));
  });

  it('renders executorRan false for a blocked scenario', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackOutcomePanel outcome={blockedOutcome} />);
    assert.ok(html.includes('Executor ran'));
    assert.equal(blockedOutcome.executorRan, false);
  });

  it('renders executorRan true for a warning-allowed scenario', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackOutcomePanel outcome={allowedOutcome} />);
    assert.ok(html.includes('Executor ran'));
    assert.equal(allowedOutcome.executorRan, true);
  });

  it('renders an empty state with no outcome', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackOutcomePanel />);
    assert.ok(html.includes('has not produced an outcome yet'));
  });
});
