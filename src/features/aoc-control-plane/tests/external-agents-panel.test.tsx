import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { ExternalAgentsPanel } from '../components/external-agents/ExternalAgentsPanel.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('ExternalAgentsPanel', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('renders external agents', () => {
    const html = renderToStaticMarkup(<ExternalAgentsPanel externalAgents={model.externalAgents} />);
    assert.ok(html.includes('Trusted Partner Research Agent'));
  });

  it('renders handshake requests', () => {
    const html = renderToStaticMarkup(<ExternalAgentsPanel externalAgents={model.externalAgents} />);
    assert.ok(html.includes('handshake-request-enforcement-demo'));
  });

  it('renders visas', () => {
    const html = renderToStaticMarkup(<ExternalAgentsPanel externalAgents={model.externalAgents} />);
    assert.equal(model.externalAgents.visas.length, 1);
    assert.ok(html.includes(model.externalAgents.visas[0]!.id));
  });

  it('renders ingress grants', () => {
    const html = renderToStaticMarkup(<ExternalAgentsPanel externalAgents={model.externalAgents} />);
    assert.equal(model.externalAgents.ingressGrants.length, 1);
    assert.ok(html.includes(model.externalAgents.ingressGrants[0]!.id));
  });

  it('renders the trust boundary summary', () => {
    const html = renderToStaticMarkup(<ExternalAgentsPanel externalAgents={model.externalAgents} />);
    assert.ok(html.includes('Requires approval for unknown issuers'));
  });

  it('renders the external standing badge', () => {
    const html = renderToStaticMarkup(<ExternalAgentsPanel externalAgents={model.externalAgents} />);
    assert.ok(html.includes('aoc-badge'));
  });
});
