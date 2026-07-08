import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../services/export-package-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeItem(
  ctx: ExportRuntimeContext,
  type: ExportPackageItemType,
  sourceModule: ExportPackageItemSourceModule,
  sourceId: string,
  payload: Record<string, unknown> = {},
): ExportPackageItem {
  return {
    id: ctx.ids.nextId('item'),
    type,
    sourceModule,
    sourceId,
    title: `Item for ${sourceId}`,
    summary: `Summary for ${sourceId}`,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

interface ThreePackageWorld {
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly decisionPacket: ExportPackage;
  readonly policyPacket: ExportPackage;
  readonly evidencePacket: ExportPackage;
}

/**
 * Builds three distinct packages spanning trustDomainId/type/status/targetType/targetId/recipient/createdByActorId,
 * sealing and verifying only the first, for query-service coverage.
 */
function buildThreePackageWorld(): ThreePackageWorld {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const summaryItem1 = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
  const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { allowedToExecute: true });
  const proofItem = makeItem(ctx, 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { enforcementDecisionId: 'enforcement-decision-1' });
  const { pkg: decisionPacketDraft } = runtime.createDecisionPacket({
    title: 'Decision Packet Alpha',
    description: 'First test package, sealed and verified.',
    trustDomainId: 'trust-domain-alpha',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    recipient: { type: 'auditor', purpose: 'audit' },
    sections: [
      { type: 'summary', required: true, items: [summaryItem1] },
      { type: 'enforcement', required: true, items: [decisionItem, proofItem] },
    ],
  });
  runtime.sealPackage(decisionPacketDraft.id);
  runtime.verifyPackage(decisionPacketDraft.id);
  const decisionPacket = runtime.getPackage(decisionPacketDraft.id);
  if (decisionPacket === undefined) {
    throw new Error('Expected the decision packet to be stored.');
  }

  const summaryItem2 = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-2', {});
  const policyItem = makeItem(ctx, 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1', { reason: 'Allowed by policy pack.' });
  const { pkg: policyPacket } = runtime.createPolicyDecisionPacket({
    title: 'Policy Decision Packet Beta',
    description: 'Second test package, left in draft status.',
    trustDomainId: 'trust-domain-beta',
    targetType: 'policy_decision',
    targetId: 'policy-decision-1',
    createdByActorId: 'actor-beta',
    sections: [
      { type: 'summary', required: true, items: [summaryItem2] },
      { type: 'policy', required: true, items: [policyItem] },
    ],
  });

  const summaryItem3 = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-3', {});
  const evidenceItem = makeItem(ctx, 'evidence_proof', 'evidence_source_runtime', 'evidence-proof-1', {});
  const { pkg: evidencePacket } = runtime.createEvidencePacket({
    title: 'Evidence Packet Zephyr',
    description: 'Third test package, left in draft status.',
    trustDomainId: 'trust-domain-alpha',
    targetType: 'evidence_proof',
    targetId: 'evidence-proof-1',
    sections: [
      { type: 'summary', required: true, items: [summaryItem3] },
      { type: 'evidence', required: true, items: [evidenceItem] },
    ],
  });

  return { ctx, runtime, decisionPacket, policyPacket, evidencePacket };
}

describe('ExportPackageQueryService', () => {
  it('1. filters by trustDomainId', () => {
    const { runtime, decisionPacket, evidencePacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ trustDomainId: 'trust-domain-alpha' });
    assert.deepEqual(
      results.map((pkg) => pkg.id).sort(),
      [decisionPacket.id, evidencePacket.id].sort(),
    );
  });

  it('2. filters by type', () => {
    const { runtime, policyPacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ type: 'policy_decision_packet' });
    assert.deepEqual(
      results.map((pkg) => pkg.id),
      [policyPacket.id],
    );
  });

  it('3. filters by status', () => {
    const { runtime, decisionPacket, policyPacket, evidencePacket } = buildThreePackageWorld();
    assert.deepEqual(
      runtime.queryPackages({ status: 'verified' }).map((pkg) => pkg.id),
      [decisionPacket.id],
    );
    assert.deepEqual(
      runtime.queryPackages({ status: 'draft' }).map((pkg) => pkg.id).sort(),
      [policyPacket.id, evidencePacket.id].sort(),
    );
  });

  it('4. filters by targetType', () => {
    const { runtime, evidencePacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ targetType: 'evidence_proof' });
    assert.deepEqual(
      results.map((pkg) => pkg.id),
      [evidencePacket.id],
    );
  });

  it('5. filters by targetId', () => {
    const { runtime, policyPacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ targetId: 'policy-decision-1' });
    assert.deepEqual(
      results.map((pkg) => pkg.id),
      [policyPacket.id],
    );
  });

  it('6. filters by recipientPurpose', () => {
    const { runtime, decisionPacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ recipientPurpose: 'audit' });
    assert.deepEqual(
      results.map((pkg) => pkg.id),
      [decisionPacket.id],
    );
  });

  it('7. filters by verification status (only sealed+verified packages)', () => {
    const { runtime, decisionPacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ verificationStatus: 'verified' });
    assert.deepEqual(
      results.map((pkg) => pkg.id),
      [decisionPacket.id],
    );
  });

  it('8. searches title and description', () => {
    const { runtime, evidencePacket } = buildThreePackageWorld();
    const results = runtime.queryPackages({ search: 'Zephyr' });
    assert.deepEqual(
      results.map((pkg) => pkg.id),
      [evidencePacket.id],
    );
  });

  it('9. sorts deterministically by createdAt then id across repeated calls', () => {
    const { runtime, decisionPacket, policyPacket, evidencePacket } = buildThreePackageWorld();
    const first = runtime.queryPackages({}).map((pkg) => pkg.id);
    const second = runtime.queryPackages({}).map((pkg) => pkg.id);
    assert.deepEqual(first, second);
    assert.deepEqual(first, [decisionPacket.id, policyPacket.id, evidencePacket.id]);
  });

  it('10. findPackagesBySource finds the package containing a matching item, and [] for an unrelated id', () => {
    const { runtime, decisionPacket } = buildThreePackageWorld();
    assert.deepEqual(
      runtime.queryService.findPackagesBySource('action_enforcement', 'enforcement-decision-1').map((pkg) => pkg.id),
      [decisionPacket.id],
    );
    assert.deepEqual(runtime.queryService.findPackagesBySource('action_enforcement', 'no-such-source-id'), []);
  });

  it('11. findPackagesByPolicyDecisionId finds the package containing a matching policy_decision item', () => {
    const { runtime, policyPacket } = buildThreePackageWorld();
    assert.deepEqual(
      runtime.queryService.findPackagesByPolicyDecisionId('policy-decision-1').map((pkg) => pkg.id),
      [policyPacket.id],
    );
    assert.deepEqual(runtime.queryService.findPackagesByPolicyDecisionId('no-such-policy-decision'), []);
  });

  it('12. findPackagesByEvidenceProofId finds the package containing a matching evidence_proof item', () => {
    const { runtime, evidencePacket } = buildThreePackageWorld();
    assert.deepEqual(
      runtime.queryService.findPackagesByEvidenceProofId('evidence-proof-1').map((pkg) => pkg.id),
      [evidencePacket.id],
    );
    assert.deepEqual(runtime.queryService.findPackagesByEvidenceProofId('no-such-evidence-proof'), []);
  });

  it('13. findPackagesByEnforcementDecisionId finds the package containing a matching enforcement_decision item', () => {
    const { runtime, decisionPacket } = buildThreePackageWorld();
    assert.deepEqual(
      runtime.queryService.findPackagesByEnforcementDecisionId('enforcement-decision-1').map((pkg) => pkg.id),
      [decisionPacket.id],
    );
    assert.deepEqual(runtime.queryService.findPackagesByEnforcementDecisionId('no-such-enforcement-decision'), []);
  });
});
