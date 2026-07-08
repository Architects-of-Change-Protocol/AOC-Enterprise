import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import { ExportPackageStore } from '../services/export-package-store.js';
import { ExportPackageLedger, createExportPackageLedger } from '../services/export-package-ledger.js';
import { ExportPackageHashService } from '../services/export-package-hash-service.js';
import { ExportPackageManifestService } from '../services/export-package-manifest-service.js';
import { ExportPackageBuilder, type CreatePackageInput } from '../services/export-package-builder.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../services/export-package-runtime.js';

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

interface BuilderWorld {
  readonly ctx: ExportRuntimeContext;
  readonly store: ExportPackageStore;
  readonly ledger: ExportPackageLedger;
  readonly builder: ExportPackageBuilder;
}

function buildBuilderWorld(): BuilderWorld {
  const ctx = createExportRuntimeContext(NOW);
  const store = new ExportPackageStore();
  const ledger = createExportPackageLedger(ctx, store);
  const hashService = new ExportPackageHashService();
  const manifestService = new ExportPackageManifestService(hashService);
  const builder = new ExportPackageBuilder(hashService, manifestService);
  return { ctx, store, ledger, builder };
}

describe('ExportPackageBuilder', () => {
  it('1. createPackage builds a decision_packet with a manifest', () => {
    const { ctx, store, ledger, builder } = buildBuilderWorld();
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});

    const input: CreatePackageInput = {
      type: 'decision_packet',
      title: 'Decision packet',
      description: 'A decision packet built directly via the builder.',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    };
    const { pkg, manifest } = builder.createPackage(ctx, store, ledger, input);

    assert.equal(pkg.type, 'decision_packet');
    assert.equal(pkg.status, 'draft');
    assert.equal(pkg.manifestId, manifest.id);
    assert.equal(manifest.packageId, pkg.id);
    assert.deepEqual(manifest.missingRequiredSections, []);

    const summarySection = required(
      pkg.sections.find((section) => section.type === 'summary'),
      'Expected a summary section.',
    );
    const enforcementSection = required(
      pkg.sections.find((section) => section.type === 'enforcement'),
      'Expected an enforcement section.',
    );
    assert.deepEqual(
      summarySection.items.map((item) => item.id),
      [summaryItem.id],
    );
    assert.deepEqual(
      enforcementSection.items.map((item) => item.id),
      [decisionItem.id],
    );
  });

  it('2. covers all six named runtime convenience methods, each producing the right package type', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);

    const summaryFor = (sourceId: string) => makeItem(ctx, 'summary_text', 'verifiable_export_package', sourceId, {});

    const decision = runtime.createDecisionPacket({
      title: 'Decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryFor('summary-decision')] },
        { type: 'enforcement', required: true, items: [makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {})] },
      ],
    });
    assert.equal(decision.pkg.type, 'decision_packet');

    const policy = runtime.createPolicyDecisionPacket({
      title: 'Policy decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'policy_decision',
      targetId: 'policy-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryFor('summary-policy')] },
        { type: 'policy', required: true, items: [makeItem(ctx, 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1', {})] },
      ],
    });
    assert.equal(policy.pkg.type, 'policy_decision_packet');

    const enforcement = runtime.createEnforcementDecisionPacket({
      title: 'Enforcement decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-2',
      sections: [
        { type: 'summary', required: true, items: [summaryFor('summary-enforcement')] },
        { type: 'enforcement', required: true, items: [makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-2', {})] },
      ],
    });
    assert.equal(enforcement.pkg.type, 'enforcement_decision_packet');

    const approval = runtime.createApprovalDecisionPacket({
      title: 'Approval decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'approval_decision',
      targetId: 'approval-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryFor('summary-approval')] },
        { type: 'approval', required: true, items: [makeItem(ctx, 'approval_decision', 'approval_runtime', 'approval-decision-1', {})] },
      ],
    });
    assert.equal(approval.pkg.type, 'approval_decision_packet');

    const evidence = runtime.createEvidencePacket({
      title: 'Evidence packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'evidence_proof',
      targetId: 'evidence-proof-1',
      sections: [
        { type: 'summary', required: true, items: [summaryFor('summary-evidence')] },
        { type: 'evidence', required: true, items: [makeItem(ctx, 'evidence_proof', 'evidence_source_runtime', 'evidence-proof-1', {})] },
      ],
    });
    assert.equal(evidence.pkg.type, 'evidence_packet');

    const enterpriseDemo = runtime.createEnterpriseDemoPacket({
      title: 'Enterprise demo packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'demo_scenario',
      targetId: 'demo-scenario-1',
      sections: [
        { type: 'summary', required: true, items: [summaryFor('summary-demo')] },
        { type: 'enterprise_demo', required: true, items: [makeItem(ctx, 'demo_scenario', 'aoc_enterprise_demo', 'demo-scenario-1', {})] },
      ],
    });
    assert.equal(enterpriseDemo.pkg.type, 'enterprise_demo_packet');

    for (const result of [decision, policy, enforcement, approval, evidence, enterpriseDemo]) {
      assert.deepEqual(result.manifest.missingRequiredSections, []);
    }
  });

  it('3. createAuditBundle produces an audit_bundle package plus an AuditBundle record', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-referenced', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg: referencedPkg } = runtime.createDecisionPacket({
      title: 'Referenced decision packet',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });
    runtime.sealPackage(referencedPkg.id);
    runtime.verifyPackage(referencedPkg.id);

    const auditSummaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'audit-summary-1', {});
    const { pkg, auditBundle } = runtime.createAuditBundle({
      title: 'Audit bundle',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      scope: { trustDomainId: 'trust-domain-1', actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [referencedPkg.id],
      sections: [{ type: 'summary', required: true, items: [auditSummaryItem] }],
    });

    assert.equal(pkg.type, 'audit_bundle');
    assert.equal(auditBundle.packageId, pkg.id);
    assert.deepEqual(auditBundle.packageIds, [referencedPkg.id]);
    assert.equal(auditBundle.summary.packageCount, 1);
    assert.equal(typeof auditBundle.bundleHash, 'string');
  });

  it('4. marks a section with zero items as not_available', () => {
    const { ctx, store, ledger, builder } = buildBuilderWorld();
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const evidenceItem = makeItem(ctx, 'evidence_proof', 'evidence_source_runtime', 'evidence-proof-1', {});

    const { pkg } = builder.createPackage(ctx, store, ledger, {
      type: 'evidence_packet',
      title: 'Evidence packet with an empty optional section',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'evidence_proof',
      targetId: 'evidence-proof-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'evidence', required: true, items: [evidenceItem] },
        { type: 'citations', required: false, items: [] },
      ],
    });

    const citationsSection = required(
      pkg.sections.find((section) => section.type === 'citations'),
      'Expected a citations section.',
    );
    assert.equal(citationsSection.status, 'not_available');
    assert.equal(citationsSection.itemCount, 0);
  });

  it('5. marks a section as incomplete with missingReferenceIds when a referenced fact is not included', () => {
    const { ctx, store, ledger, builder } = buildBuilderWorld();
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { policyProofId: 'policy-proof-not-included' });

    const { pkg } = builder.createPackage(ctx, store, ledger, {
      type: 'decision_packet',
      title: 'Decision packet with an unresolved reference',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [summaryItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });

    const enforcementSection = required(
      pkg.sections.find((section) => section.type === 'enforcement'),
      'Expected an enforcement section.',
    );
    assert.equal(enforcementSection.status, 'incomplete');
    assert.ok(enforcementSection.missingReferenceIds.length > 0);
    assert.ok(enforcementSection.missingReferenceIds.some((entry) => entry.includes('policy-proof-not-included')));
  });

  it('6. sealPackage sets status sealed, a packageHash, and a sealedAt timestamp', () => {
    const { ctx, store, ledger, builder } = buildBuilderWorld();
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
    const { pkg } = builder.createPackage(ctx, store, ledger, {
      type: 'decision_packet',
      title: 'Decision packet to seal',
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
    assert.equal(pkg.packageHash, undefined);

    const sealed = builder.sealPackage(ctx, store, ledger, pkg.id);
    assert.equal(sealed.status, 'sealed');
    assert.equal(typeof sealed.packageHash, 'string');
    assert.equal(sealed.sealedAt, NOW);
  });

  it('7. does not mutate the literal item objects it was given', () => {
    const { ctx, store, ledger, builder } = buildBuilderWorld();
    const literalItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', { text: 'original value' });
    const literalItemSnapshot = JSON.parse(JSON.stringify(literalItem)) as ExportPackageItem;
    const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});

    const { pkg } = builder.createPackage(ctx, store, ledger, {
      type: 'decision_packet',
      title: 'Decision packet for non-mutation check',
      description: 'd',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [
        { type: 'summary', required: true, items: [literalItem] },
        { type: 'enforcement', required: true, items: [decisionItem] },
      ],
    });
    builder.sealPackage(ctx, store, ledger, pkg.id);

    assert.deepEqual(literalItem, literalItemSnapshot);
    const storedSummarySection = required(
      store.getPackage(pkg.id)?.sections.find((section) => section.type === 'summary'),
      'Expected a stored summary section.',
    );
    assert.deepEqual(storedSummarySection.items[0], literalItemSnapshot);
  });

  it('8. produces a deterministic packageHash for the same inputs built from two fresh worlds', () => {
    function build(): string {
      const { ctx, store, ledger, builder } = buildBuilderWorld();
      const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', { text: 'hello' });
      const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { allowedToExecute: true });
      const { pkg } = builder.createPackage(ctx, store, ledger, {
        type: 'decision_packet',
        title: 'Determinism test package',
        description: 'd',
        trustDomainId: 'trust-domain-1',
        targetType: 'enforcement_decision',
        targetId: 'enforcement-decision-1',
        sections: [
          { type: 'summary', required: true, items: [summaryItem] },
          { type: 'enforcement', required: true, items: [decisionItem] },
        ],
      });
      const sealed = builder.sealPackage(ctx, store, ledger, pkg.id);
      return required(sealed.packageHash, 'Expected a packageHash after sealing.');
    }

    const hashA = build();
    const hashB = build();
    assert.equal(hashA, hashB);
  });
});
