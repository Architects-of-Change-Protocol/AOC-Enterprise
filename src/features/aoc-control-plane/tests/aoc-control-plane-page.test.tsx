import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture, type ControlPlaneRuntimeBundle } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { AocControlPlanePage } from '../components/AocControlPlanePage.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import type { AocSection } from '../domain/control-plane-navigation.js';

describe('AocControlPlanePage', () => {
  let bundle: ControlPlaneRuntimeBundle;
  let model: AocControlPlaneReadModel;

  before(async () => {
    bundle = await buildControlPlaneDemoFixture();
    model = buildControlPlaneReadModel(bundle);
  });

  it('renders the title', () => {
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} />);
    assert.ok(html.includes('AOC Control Plane'));
  });

  it('renders navigation sections', () => {
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} />);
    for (const label of ['Overview', 'Recognition', 'Authority', 'Approvals', 'External Agents', 'Enforcement', 'Policy Packs', 'Proofs / Audit']) {
      assert.ok(html.includes(label), `expected navigation label "${label}"`);
    }
  });

  it('renders overview by default', () => {
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} />);
    assert.ok(html.includes('Recognized Actors'));
  });

  it('switches sections via initialSection, rendering exactly one panel heading', () => {
    const sectionHeadings: Record<AocSection, string> = {
      overview: '',
      recognition: '<h2>Recognition</h2>',
      authority: '<h2>Authority</h2>',
      approvals: '<h2>Approvals</h2>',
      'external-agents': '<h2>External Agents</h2>',
      enforcement: '<h2>Enforcement</h2>',
      'policy-packs': '<h2>Policy Packs</h2>',
      proofs: '<h2>Proofs / Audit</h2>',
    };
    for (const section of Object.keys(sectionHeadings) as AocSection[]) {
      if (section === 'overview') continue;
      const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} initialSection={section} />);
      assert.ok(html.includes(sectionHeadings[section]), `expected heading for ${section}`);
      for (const other of Object.keys(sectionHeadings) as AocSection[]) {
        if (other === section || other === 'overview') continue;
        assert.ok(!html.includes(sectionHeadings[other]), `did not expect ${other}'s heading while viewing ${section}`);
      }
    }
  });

  it('shows the trust domain', () => {
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} />);
    assert.ok(html.includes(bundle.trustDomainId));
  });
});
