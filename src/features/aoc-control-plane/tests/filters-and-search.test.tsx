import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { AocControlPlanePage } from '../components/AocControlPlanePage.js';
import { AocSearchResultsTable } from '../components/AocSearchResultsTable.js';
import { queryReadModel } from '../services/control-plane-query-service.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('Filters and search', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('search filters visible rows', () => {
    const all = queryReadModel(model, {});
    const narrowed = queryReadModel(model, { search: 'actor-unknown-external-agent' });
    assert.ok(narrowed.length < all.length);
    assert.ok(narrowed.every((item) => JSON.stringify(item).includes('actor-unknown-external-agent')));
  });

  it('status filter works', () => {
    const filtered = queryReadModel(model, { status: 'evidence_required' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.status === 'evidence_required'));
  });

  it('source filter works', () => {
    const filtered = queryReadModel(model, { source: 'authority' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.source === 'authority'));
  });

  it('action filter works', () => {
    const filtered = queryReadModel(model, { action: 'draft_closure_email' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.action === 'draft_closure_email'));
  });

  it('empty state appears when no match', () => {
    const html = renderToStaticMarkup(<AocSearchResultsTable results={[]} />);
    assert.ok(html.includes('No results match the current search and filters.'));
  });

  it('the page renders the search input and filter controls, with no filter active by default', () => {
    const html = renderToStaticMarkup(<AocControlPlanePage readModel={model} />);
    assert.ok(html.includes('role="searchbox"'));
    assert.ok(html.includes('role="search"'));
    assert.ok(!html.includes('aria-label="Search results"'), 'search results table should not render until a filter is active');
  });
});
