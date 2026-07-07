import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { PolicyEnforcementLinkPanel } from '../components/policy-packs/PolicyEnforcementLinkPanel.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import type { PolicyEnforcementLinkRow } from '../domain/policy-pack-view-model.js';

describe('PolicyEnforcementLinkPanel', () => {
  let model: AocControlPlaneReadModel;
  let blockedLink: PolicyEnforcementLinkRow;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    const found = model.policyPacks.enforcementLinks.find((link) => link.blockedByPolicy);
    assert.ok(found);
    blockedLink = found!;
  });

  it('1. renders enforcement decision ID', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(html.includes(blockedLink.enforcementDecisionId!));
  });

  it('2. renders enforcement proof ID', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(blockedLink.enforcementProofId !== undefined);
    assert.ok(html.includes(blockedLink.enforcementProofId!));
  });

  it('3. renders policy decision ID', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(html.includes(blockedLink.policyDecisionId!));
  });

  it('4. renders policy proof ID', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(html.includes(blockedLink.policyProofId!));
  });

  it('5. renders policy pack version IDs', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(blockedLink.policyPackVersionIds.length > 0);
    assert.ok(html.includes(blockedLink.policyPackVersionIds[0]!));
  });

  it('6. renders matched rule IDs', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(blockedLink.matchedRuleIds.length > 0);
    assert.ok(html.includes(blockedLink.matchedRuleIds[0]!));
  });

  it('7. renders blockedByPolicy true', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(html.includes('blocked by policy'));
  });

  it('8. renders reason', () => {
    const html = renderToStaticMarkup(<PolicyEnforcementLinkPanel link={blockedLink} />);
    assert.ok(blockedLink.reason !== undefined);
    assert.ok(html.includes(blockedLink.reason!));
  });
});
