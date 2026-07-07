import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildControlPlaneDemoFixture, type ControlPlaneRuntimeBundle } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { flattenSearchableItems, filterItems, queryReadModel } from '../services/control-plane-query-service.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('ControlPlaneQueryService', () => {
  let bundle: ControlPlaneRuntimeBundle;
  let model: AocControlPlaneReadModel;

  before(async () => {
    bundle = await buildControlPlaneDemoFixture();
    model = buildControlPlaneReadModel(bundle);
  });

  it('filters by trustDomainId', () => {
    const items = flattenSearchableItems(model);
    const filtered = filterItems(items, { trustDomainId: bundle.trustDomainId });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.trustDomainId === undefined || item.trustDomainId === bundle.trustDomainId));
  });

  it('filters by actorId', () => {
    const filtered = queryReadModel(model, { actorId: 'actor-pmfreak-closure-agent' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.actorId === 'actor-pmfreak-closure-agent'));
  });

  it('filters by action', () => {
    const filtered = queryReadModel(model, { action: 'draft_closure_email' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.action === 'draft_closure_email'));
  });

  it('filters by capability', () => {
    const filtered = queryReadModel(model, { capability: 'project_closure.management' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.capability === 'project_closure.management'));
  });

  it('filters by resourceScope', () => {
    const filtered = queryReadModel(model, { resourceScope: 'project:HMP-14665' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.resourceScope === 'project:HMP-14665'));
  });

  it('filters by status', () => {
    const filtered = queryReadModel(model, { status: 'evidence_required' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.status === 'evidence_required'));
  });

  it('filters by source', () => {
    const filtered = queryReadModel(model, { source: 'handshake' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every((item) => item.source === 'handshake'));
  });

  it('text search finds a proof by hash', () => {
    assert.ok(model.proofs.enforcementProofs.length > 0);
    const someProofHash = model.proofs.enforcementProofs[0]!.proofHash;
    const filtered = queryReadModel(model, { search: someProofHash });
    assert.ok(filtered.some((item) => item.proofHash === someProofHash));
  });

  it('text search finds items by reasonCode', () => {
    const filtered = queryReadModel(model, { search: 'EVIDENCE_MISSING' });
    assert.ok(filtered.some((item) => item.reasonCode === 'EVIDENCE_MISSING'));
  });

  it('sorts deterministically by createdAt desc then id', () => {
    const first = queryReadModel(model, {});
    const second = queryReadModel(model, {});
    assert.deepEqual(first, second);
    for (let i = 1; i < first.length; i += 1) {
      const previous = first[i - 1]!;
      const current = first[i]!;
      const inOrder = previous.createdAt > current.createdAt || (previous.createdAt === current.createdAt && previous.id <= current.id);
      assert.ok(inOrder, `expected deterministic ordering at index ${i}`);
    }
  });
});
