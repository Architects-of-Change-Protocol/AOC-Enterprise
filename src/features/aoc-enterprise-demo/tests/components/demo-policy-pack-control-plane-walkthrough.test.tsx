import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoPolicyPackControlPlaneWalkthrough } from '../../components/DemoPolicyPackControlPlaneWalkthrough.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoPolicyPackControlPlaneSnapshot } from '../../domain/demo-policy-pack.js';

describe('DemoPolicyPackControlPlaneWalkthrough', () => {
  let snapshot: DemoPolicyPackControlPlaneSnapshot;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    snapshot = run.policyControlPlaneSnapshot;
  });

  it('renders a Policy Packs panel anchor', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackControlPlaneWalkthrough snapshot={snapshot} />);
    assert.ok(html.includes('policy-walkthrough-panel-policy_packs'));
    assert.ok(html.includes('Policy Packs'));
  });

  it('renders an Enforcement panel anchor', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackControlPlaneWalkthrough snapshot={snapshot} />);
    assert.ok(html.includes('policy-walkthrough-panel-enforcement'));
    assert.ok(html.includes('Enforcement'));
  });

  it('renders a Proofs / Audit panel anchor', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackControlPlaneWalkthrough snapshot={snapshot} />);
    assert.ok(html.includes('policy-walkthrough-panel-proofs'));
    assert.ok(html.includes('Proofs / Audit'));
  });

  it('renders highlighted rows', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackControlPlaneWalkthrough snapshot={snapshot} />);
    assert.ok(html.includes(snapshot.highlightedDecisionId ?? snapshot.highlightedPackIds[0] ?? ''));
  });

  it('renders operator narration', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackControlPlaneWalkthrough snapshot={snapshot} />);
    assert.ok(html.includes('policy-walkthrough-narration'));
    for (const anchor of snapshot.walkthroughAnchors) {
      assert.ok(html.includes(anchor.narration));
    }
  });

  it('renders an empty state with no snapshot', () => {
    const html = renderToStaticMarkup(<DemoPolicyPackControlPlaneWalkthrough />);
    assert.ok(html.includes('No policy-pack Control Plane snapshot'));
  });
});
