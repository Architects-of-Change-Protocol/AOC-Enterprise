import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture, type ControlPlaneRuntimeBundle } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { AocControlPlanePage } from '../components/AocControlPlanePage.js';
import { AocNavigationTabs } from '../components/AocNavigationTabs.js';
import { AocOverviewDashboard } from '../components/AocOverviewDashboard.js';
import { EnforcementDecisionDetail } from '../components/enforcement/EnforcementDecisionDetail.js';
import { ProofsPanel } from '../components/proofs/ProofsPanel.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('Policy pack navigation', () => {
  let bundle: ControlPlaneRuntimeBundle;
  let model: AocControlPlaneReadModel;

  before(async () => {
    bundle = await buildControlPlaneDemoFixture();
    model = buildControlPlaneReadModel(bundle);
  });

  it('1. AocNavigationTabs includes Policy Packs', () => {
    const html = renderToStaticMarkup(<AocNavigationTabs selected="overview" onSelect={() => {}} />);
    assert.ok(html.includes('Policy Packs'));
  });

  it('2. AocControlPlanePage can render Policy Packs section', () => {
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} initialSection="policy-packs" />);
    assert.ok(html.includes('<h2>Policy Packs</h2>'));
  });

  it('3. Overview includes policy metrics', () => {
    const html = renderToStaticMarkup(<AocOverviewDashboard overview={model.overview} timeline={model.timeline} />);
    assert.ok(html.includes('Policy-blocked Executions'));
  });

  it('4. Enforcement detail shows policy references when present', () => {
    const decision = model.enforcement.decisions.find((d) => d.policyDecisionId !== undefined);
    assert.ok(decision);
    const html = renderToStaticMarkup(<EnforcementDecisionDetail decision={decision!} />);
    assert.ok(html.includes(decision!.policyDecisionId!));
    assert.ok(html.includes('Policy reason code'));
  });

  it('5. Proofs panel includes policy proof references when present', () => {
    const html = renderToStaticMarkup(<ProofsPanel proofs={model.proofs} auditEvents={model.recognition.auditEvents} />);
    assert.ok(model.proofs.policyProofs.length > 0);
    assert.ok(html.includes(model.proofs.policyProofs[0]!.id));
    assert.ok(html.includes('Policy proofs'));
  });
});
