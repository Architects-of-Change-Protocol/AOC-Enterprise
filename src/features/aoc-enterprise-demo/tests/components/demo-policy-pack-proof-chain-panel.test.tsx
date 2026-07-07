import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoPolicyPackProofChainPanel } from '../../components/DemoPolicyPackProofChainPanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoPolicyPackControlPlaneSnapshot } from '../../domain/demo-policy-pack.js';
import type { DemoScenarioOutcome } from '../../domain/demo-outcome.js';

describe('DemoPolicyPackProofChainPanel', () => {
  let snapshot: DemoPolicyPackControlPlaneSnapshot;
  let outcome: DemoScenarioOutcome;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    snapshot = run.policyControlPlaneSnapshot;
    outcome = run.outcome!;
  });

  it('renders the enforcement proof reference', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackProofChainPanel snapshot={snapshot} outcome={outcome} />);
    assert.ok(html.includes(outcome.enforcementDecisionId!));
  });

  it('renders the policy proof', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackProofChainPanel snapshot={snapshot} outcome={outcome} />);
    assert.ok(html.includes(snapshot.highlightedProofId!));
  });

  it('renders the policy pack version', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackProofChainPanel snapshot={snapshot} outcome={outcome} />);
    assert.ok(html.includes(snapshot.highlightedVersionIds[0]!));
  });

  it('renders matched rules', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackProofChainPanel snapshot={snapshot} outcome={outcome} />);
    assert.ok(html.includes(snapshot.highlightedRuleIds[0]!));
  });

  it('renders the complete/incomplete state', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackProofChainPanel snapshot={snapshot} outcome={outcome} />);
    assert.ok(html.includes(snapshot.policyProofChainComplete ? 'Complete' : 'Incomplete'));
  });

  it('renders an empty state with no snapshot', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackProofChainPanel />);
    assert.ok(html.includes('No policy proof chain has been extracted'));
  });
});
