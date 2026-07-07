import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { AuthorityPanel } from '../components/authority/AuthorityPanel.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('AuthorityPanel', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('renders authority grants', () => {
    const html = renderToStaticMarkup(<AuthorityPanel authority={model.authority} />);
    assert.ok(html.includes('authority-grant-victor-project-closure'));
  });

  it('renders delegation grants', () => {
    const html = renderToStaticMarkup(<AuthorityPanel authority={model.authority} />);
    assert.ok(html.includes('delegation-grant-pmfreak-project-closure'));
  });

  it('renders role assignments', () => {
    const html = renderToStaticMarkup(<AuthorityPanel authority={model.authority} />);
    assert.ok(html.includes('role-assignment-victor-project-manager'));
  });

  it('renders the authority chain viewer', () => {
    const html = renderToStaticMarkup(<AuthorityPanel authority={model.authority} />);
    assert.ok(html.includes('aoc-authority-chain'));
    assert.ok(html.includes('actor-victor-valverde'));
  });

  it('renders a proof detail when a proof is selected by default state', () => {
    const html = renderToStaticMarkup(<AuthorityPanel authority={model.authority} />);
    assert.ok(html.includes('Authority proofs'));
    assert.ok(model.authority.proofs.length > 0);
  });
});
