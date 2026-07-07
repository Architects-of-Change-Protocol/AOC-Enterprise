import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapDemoControlPlaneSnapshotToItem, mapControlPlaneReadModelToItem } from '../../integrations/control-plane-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { DemoControlPlaneSnapshot } from '../../../aoc-enterprise-demo/domain/demo-control-plane-snapshot.js';
import type { AocControlPlaneReadModel } from '../../../aoc-control-plane/domain/control-plane-view-model.js';
import { EMPTY_POLICY_PACK_VIEW_MODEL } from '../../../aoc-control-plane/domain/policy-pack-view-model.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeSnapshot(overrides: Partial<DemoControlPlaneSnapshot> = {}): DemoControlPlaneSnapshot {
  return {
    id: 'control-plane-snapshot-1',
    scenarioId: 'internal-agent-allowed',
    trustDomainId: 'trust-domain-1',
    generatedAt: NOW,
    overviewMetricIds: ['metric-1'],
    visiblePanelIds: ['overview', 'recognition'],
    highlightedRows: [{ id: 'highlight-1', panel: 'recognition', rowId: 'row-1', reason: 'Actor was recognized.' }],
    timelineItemIds: ['timeline-1'],
    proofChainIds: ['proof-chain-1'],
    ...overrides,
  };
}

function makeReadModel(overrides: Partial<AocControlPlaneReadModel> = {}): AocControlPlaneReadModel {
  return {
    trustDomainId: 'trust-domain-1',
    generatedAt: NOW,
    overview: {
      metrics: [],
      health: { status: 'healthy', reasonCode: 'OK', reason: 'All systems normal.' },
      recentDecisions: [],
      openItems: [],
    },
    recognition: { actors: [], passports: [], capabilityTokens: [], decisions: [], auditEvents: [] },
    authority: { grants: [], delegations: [], roleAssignments: [], decisions: [], proofs: [] },
    approvals: { requests: [], decisions: [], proofs: [], pendingCount: 0 },
    externalAgents: { externalAgents: [], handshakeRequests: [], visas: [], ingressGrants: [], trustBoundaries: [] },
    enforcement: { requests: [], decisions: [], results: [], sideEffects: [], violations: [], proofs: [] },
    proofs: {
      recognitionProofs: [],
      authorityProofs: [],
      approvalProofs: [],
      handshakeProofs: [],
      enforcementProofs: [],
      policyProofs: [],
      proofChains: [],
    },
    policyPacks: EMPTY_POLICY_PACK_VIEW_MODEL,
    timeline: [],
    ...overrides,
  };
}

describe('control-plane-export-adapter', () => {
  it('1. mapDemoControlPlaneSnapshotToItem maps a DemoControlPlaneSnapshot to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const snapshot = makeSnapshot();
    const item = mapDemoControlPlaneSnapshotToItem(ctx, snapshot);

    assert.equal(item.type, 'control_plane_snapshot');
    assert.equal(item.sourceModule, 'aoc_control_plane');
    assert.equal(item.sourceId, snapshot.id);
  });

  it('2. mapDemoControlPlaneSnapshotToItem preserves highlightedRows and visiblePanelIds verbatim, never mutating the read model', () => {
    const ctx = createExportRuntimeContext(NOW);
    const highlightedRows = [
      { id: 'highlight-1', panel: 'recognition' as const, rowId: 'row-1', reason: 'Actor was recognized.' },
      { id: 'highlight-2', panel: 'enforcement' as const, rowId: 'row-2', reason: 'Enforcement executed.' },
    ];
    const snapshot = makeSnapshot({ highlightedRows, visiblePanelIds: ['overview', 'enforcement', 'proofs'] });
    const item = mapDemoControlPlaneSnapshotToItem(ctx, snapshot);

    assert.deepEqual(item.payload.highlightedRows, highlightedRows);
    assert.deepEqual(item.payload.visiblePanelIds, ['overview', 'enforcement', 'proofs']);
  });

  it('3. mapControlPlaneReadModelToItem maps an AocControlPlaneReadModel to an ExportPackageItem with the full read model as payload', () => {
    const ctx = createExportRuntimeContext(NOW);
    const readModel = makeReadModel();
    const item = mapControlPlaneReadModelToItem(ctx, readModel);

    assert.equal(item.sourceModule, 'aoc_control_plane');
    assert.deepEqual(item.payload.trustDomainId, readModel.trustDomainId);
    assert.deepEqual(item.payload.overview, readModel.overview);
    assert.deepEqual(item.payload.policyPacks, readModel.policyPacks);
  });

  it('4. mapControlPlaneReadModelToItem derives a deterministic sourceId from trustDomainId and generatedAt', () => {
    const readModel = makeReadModel({ trustDomainId: 'trust-domain-42', generatedAt: '2026-02-02T00:00:00.000Z' });
    const itemA = mapControlPlaneReadModelToItem(createExportRuntimeContext(NOW), readModel);
    const itemB = mapControlPlaneReadModelToItem(createExportRuntimeContext(NOW), readModel);

    assert.equal(itemA.sourceId, itemB.sourceId);
    assert.equal(itemA.sourceId, 'control-plane-snapshot-trust-domain-42-2026-02-02T00:00:00.000Z');
  });
});
