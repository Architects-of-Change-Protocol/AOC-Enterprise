import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { queryPolicyPackViewModel } from '../services/control-plane-policy-pack-query-service.js';
import { PolicyPacksTable } from '../components/policy-packs/PolicyPacksTable.js';
import { PolicyEvaluationsTable } from '../components/policy-packs/PolicyEvaluationsTable.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import type { PolicyPackControlPlaneViewModel } from '../domain/policy-pack-view-model.js';

describe('Policy pack search and filters', () => {
  let model: AocControlPlaneReadModel;
  let policyPacks: PolicyPackControlPlaneViewModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
    policyPacks = model.policyPacks;
  });

  it('1. search filters policy packs', () => {
    const target = policyPacks.packs[0]!;
    const needle = target.name.split(' ')[0]!;
    const filtered = queryPolicyPackViewModel(policyPacks, { search: needle });
    const html = renderToStaticMarkup(<PolicyPacksTable packs={filtered.packs} />);
    assert.ok(html.includes(target.name));
  });

  it('2. search filters policy evaluations', () => {
    const target = policyPacks.evaluations.find((e) => e.action === 'change_bank_account')!;
    assert.ok(target);
    const filtered = queryPolicyPackViewModel(policyPacks, { search: 'change_bank_account' });
    const html = renderToStaticMarkup(<PolicyEvaluationsTable evaluations={filtered.evaluations} />);
    assert.ok(html.includes(target.action));
  });

  it('3. decision type filter works', () => {
    const filtered = queryPolicyPackViewModel(policyPacks, { decisionType: 'denied' });
    assert.ok(filtered.decisions.length > 0);
    assert.ok(filtered.decisions.every((decision) => decision.type === 'denied'));
  });

  it('4. demoOnly filter works', () => {
    const filtered = queryPolicyPackViewModel(policyPacks, { demoOnly: true });
    assert.ok(filtered.packs.every((pack) => pack.demoOnly === true));
  });

  it('5. legalCompleteness filter works', () => {
    const filtered = queryPolicyPackViewModel(policyPacks, { legalCompleteness: 'not_legal_advice' });
    assert.ok(filtered.packs.every((pack) => pack.legalCompleteness === 'not_legal_advice'));
  });

  it('6. blocked filter works', () => {
    const filtered = queryPolicyPackViewModel(policyPacks, { allowed: false });
    assert.ok(filtered.decisions.length > 0);
    assert.ok(filtered.decisions.every((decision) => decision.allowed === false));
  });

  it('7. empty state appears when no match', () => {
    const filtered = queryPolicyPackViewModel(policyPacks, { search: 'this-search-term-matches-nothing-at-all' });
    assert.equal(filtered.packs.length, 0);
    const html = renderToStaticMarkup(<PolicyPacksTable packs={filtered.packs} />);
    assert.ok(html.includes('No policy packs registered.'));
  });
});
