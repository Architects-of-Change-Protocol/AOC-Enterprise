import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import { createExportPackageRuntime } from '../services/export-package-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

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

describe('ExportPackageRuntime', () => {
  it('1. createDecisionPacket returns a matching pkg, manifest, and decisionPacket', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});

    const { pkg, manifest, decisionPacket } = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });

    assert.equal(pkg.type, 'decision_packet');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(decisionPacket.packageId, pkg.id);
  });

  it('2. createPolicyDecisionPacket returns a matching pkg, manifest, and decisionPacket', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const policyItem = makeItem(ctx, 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1', {});

    const { pkg, manifest, decisionPacket } = runtime.createPolicyDecisionPacket({
      title: 'Policy decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'policy', required: true, items: [policyItem] },
      ],
    });

    assert.equal(pkg.type, 'policy_decision_packet');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(decisionPacket.packageId, pkg.id);
  });

  it('3. createEnforcementDecisionPacket returns a matching pkg, manifest, and decisionPacket', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});

    const { pkg, manifest, decisionPacket } = runtime.createEnforcementDecisionPacket({
      title: 'Enforcement decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });

    assert.equal(pkg.type, 'enforcement_decision_packet');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(decisionPacket.packageId, pkg.id);
  });

  it('4. createApprovalDecisionPacket returns a matching pkg, manifest, and decisionPacket', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const approvalItem = makeItem(ctx, 'approval_decision', 'approval_runtime', 'approval-decision-1', {});

    const { pkg, manifest, decisionPacket } = runtime.createApprovalDecisionPacket({
      title: 'Approval decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'approval_decision',
      targetId: 'approval-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'approval', required: true, items: [approvalItem] },
      ],
    });

    assert.equal(pkg.type, 'approval_decision_packet');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(decisionPacket.packageId, pkg.id);
  });

  it('5. createEvidencePacket returns a matching pkg, manifest, and decisionPacket', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const evidenceItem = makeItem(ctx, 'evidence_proof', 'evidence_source_runtime', 'evidence-proof-1', {});

    const { pkg, manifest, decisionPacket } = runtime.createEvidencePacket({
      title: 'Evidence packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'evidence_proof',
      targetId: 'evidence-proof-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'evidence', required: true, items: [evidenceItem] },
      ],
    });

    assert.equal(pkg.type, 'evidence_packet');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(decisionPacket.packageId, pkg.id);
  });

  it('6. createEnterpriseDemoPacket returns a matching pkg, manifest, and decisionPacket', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const demoItem = makeItem(ctx, 'demo_scenario', 'aoc_enterprise_demo', 'demo-scenario-1', {});

    const { pkg, manifest, decisionPacket } = runtime.createEnterpriseDemoPacket({
      title: 'Enterprise demo packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'demo_scenario',
      targetId: 'demo-scenario-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enterprise_demo', required: true, items: [demoItem] },
      ],
    });

    assert.equal(pkg.type, 'enterprise_demo_packet');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(decisionPacket.packageId, pkg.id);
  });

  it('7. createAuditBundle returns a matching pkg, manifest, and auditBundle', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const referencedSummary = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-referenced', {});
    const referencedDecision = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg: referencedPkg } = runtime.createDecisionPacket({
      title: 'Referenced decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [referencedSummary] },
        { type: 'enforcement', required: true, items: [referencedDecision] },
      ],
    });

    const auditSummaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'audit-summary-1', {});
    const { pkg, manifest, auditBundle } = runtime.createAuditBundle({
      title: 'Audit bundle',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      scope: { trustDomainId: 'trust-domain-1', actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [referencedPkg.id],
      sections: [{ type: 'summary', required: true, items: [auditSummaryItem] }],
    });

    assert.equal(pkg.type, 'audit_bundle');
    assert.equal(manifest.packageId, pkg.id);
    assert.equal(auditBundle.packageId, pkg.id);
    assert.deepEqual(auditBundle.packageIds, [referencedPkg.id]);
  });

  it('8. sealPackage transitions the package status to sealed', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg } = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });

    assert.equal(pkg.status, 'draft');
    const sealed = runtime.sealPackage(pkg.id);
    assert.equal(sealed.status, 'sealed');
    assert.equal(typeof sealed.packageHash, 'string');
  });

  it('9. verifyPackage returns a verified result for a clean, sealed package', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg } = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });
    runtime.sealPackage(pkg.id);

    const verification = runtime.verifyPackage(pkg.id);
    assert.equal(verification.status, 'verified');
    assert.equal(verification.packageId, pkg.id);
  });

  it('10. serializePackage returns content for json_bundle and verification_manifest formats', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg } = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });
    runtime.sealPackage(pkg.id);
    runtime.verifyPackage(pkg.id);

    const jsonBundle = runtime.serializePackage(pkg.id, 'json_bundle');
    assert.equal(jsonBundle.format, 'json_bundle');
    assert.ok(jsonBundle.content.length > 0);

    const manifestArtifact = runtime.serializePackage(pkg.id, 'verification_manifest');
    assert.equal(manifestArtifact.format, 'verification_manifest');
    assert.ok(manifestArtifact.content.length > 0);
  });

  it('11. renderMarkdownSummary returns a non-empty string', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg } = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });
    runtime.sealPackage(pkg.id);
    runtime.verifyPackage(pkg.id);

    const markdown = runtime.renderMarkdownSummary(pkg.id);
    assert.equal(typeof markdown, 'string');
    assert.ok(markdown.length > 0);
  });

  it('12. getPackage/getPackageManifest/getPackageVerification/getDecisionPacket return the expected records, and undefined for an unknown id', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const created = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });
    runtime.sealPackage(created.pkg.id);
    runtime.verifyPackage(created.pkg.id);

    const pkg = required(runtime.getPackage(created.pkg.id), 'Expected the package to be found.');
    assert.equal(pkg.id, created.pkg.id);

    const manifest = required(runtime.getPackageManifest(created.pkg.id), 'Expected the manifest to be found.');
    assert.equal(manifest.packageId, created.pkg.id);

    const verification = required(runtime.getPackageVerification(created.pkg.id), 'Expected the verification to be found.');
    assert.equal(verification.packageId, created.pkg.id);

    const decisionPacket = required(runtime.getDecisionPacket(created.pkg.id), 'Expected the decision packet to be found.');
    assert.equal(decisionPacket.packageId, created.pkg.id);

    assert.equal(runtime.getPackage('unknown-package-id'), undefined);
    assert.equal(runtime.getPackageManifest('unknown-package-id'), undefined);
    assert.equal(runtime.getPackageVerification('unknown-package-id'), undefined);
    assert.equal(runtime.getDecisionPacket('unknown-package-id'), undefined);
  });

  it('13. queryPackages returns packages matching a filter', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg } = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-queried',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });

    const matches = runtime.queryPackages({ trustDomainId: 'trust-domain-queried' });
    assert.deepEqual(
      matches.map((candidate) => candidate.id),
      [pkg.id],
    );

    const nonMatches = runtime.queryPackages({ trustDomainId: 'some-other-trust-domain' });
    assert.deepEqual(nonMatches, []);
  });
});
