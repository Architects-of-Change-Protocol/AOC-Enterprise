import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { RecognitionPanel } from '../components/recognition/RecognitionPanel.js';
import type { AocControlPlaneReadModel, RecognitionViewModel } from '../domain/control-plane-view-model.js';

const EMPTY: RecognitionViewModel = { actors: [], passports: [], capabilityTokens: [], decisions: [], auditEvents: [] };

describe('RecognitionPanel', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('renders actors', () => {
    const html = renderToStaticMarkup(<RecognitionPanel recognition={model.recognition} />);
    assert.ok(html.includes('Victor Valverde'));
  });

  it('renders passports', () => {
    const html = renderToStaticMarkup(<RecognitionPanel recognition={model.recognition} />);
    assert.ok(html.includes('passport-victor'));
  });

  it('renders capability tokens', () => {
    const html = renderToStaticMarkup(<RecognitionPanel recognition={model.recognition} />);
    assert.ok(html.includes('cap-pmfreak-drafting'));
    assert.ok(html.includes('revoked'));
  });

  it('renders recognition decisions', () => {
    const html = renderToStaticMarkup(<RecognitionPanel recognition={model.recognition} />);
    assert.ok(html.includes('ALL_POLICIES_SATISFIED'));
  });

  it('renders audit events', () => {
    const html = renderToStaticMarkup(<RecognitionPanel recognition={model.recognition} />);
    assert.ok(html.includes('capability_token_revoked'));
  });

  it('renders an empty state when nothing is present', () => {
    const html = renderToStaticMarkup(<RecognitionPanel recognition={EMPTY} />);
    assert.ok(html.includes('No recognized actors.'));
    assert.ok(html.includes('No passports issued.'));
    assert.ok(html.includes('No capability tokens issued.'));
    assert.ok(html.includes('No recognition decisions recorded.'));
    assert.ok(html.includes('No audit events recorded.'));
  });
});
