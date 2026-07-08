import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../../domain/export-package.js';
import type { ExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../../domain/export-package-item.js';
import type { ExportPackageRuntime } from '../../services/export-package-runtime.js';
import { buildPolicyPackDecisionPacketFixture } from '../../fixtures/policy-pack-decision-packet.fixture.js';

// The REQUIRED_SECTIONS_BY_PACKAGE_TYPE list always requires a non-empty
// `summary` section (regardless of the `required` flag passed when building
// it), so this audit bundle carries one real summary_text item.
function buildSummaryItem(ctx: ExportRuntimeContext, sourceId: string, text: string): ExportPackageItem {
  const payload = { text };
  return {
    id: ctx.ids.nextId('export-item'),
    type: 'summary_text',
    sourceModule: 'verifiable_export_package',
    sourceId,
    title: 'Summary',
    summary: text,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

function createAuditBundleForBlockedPayment(runtime: ExportPackageRuntime, ctx: ExportRuntimeContext, trustDomainId: string, packageId: string) {
  const summaryItem = buildSummaryItem(ctx, 'summary-audit-bundle-sensitive-payment-001', 'Audit bundle covering a policy-pack-blocked, sensitive approve_payment decision.');
  return runtime.createAuditBundle({
    title: 'Audit bundle: sensitive/blocked payment approval',
    description: 'Audit bundle scoped to a policy-pack-blocked approve_payment decision.',
    trustDomainId,
    scope: { trustDomainId, actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
    packageIds: [packageId],
    sections: [{ type: 'summary', required: true, items: [summaryItem] }],
  });
}

describe('export scenario: sensitive/blocked action rolled into an audit bundle', () => {
  it('1. creates an audit bundle referencing the blocked payment decision packet', async () => {
    const { runtime, ctx, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();
    const { auditBundle } = createAuditBundleForBlockedPayment(runtime, ctx, outcome.request.trustDomainId, packageId);
    assert.equal(auditBundle.summary.packageCount, 1);
  });

  it('2. produces a non-empty bundleHash', async () => {
    const { runtime, ctx, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();
    const { auditBundle } = createAuditBundleForBlockedPayment(runtime, ctx, outcome.request.trustDomainId, packageId);
    assert.equal(typeof auditBundle.bundleHash, 'string');
    assert.ok(auditBundle.bundleHash.length > 0);
  });

  it('3. the new audit_bundle package is a distinct package from the original decision packet', async () => {
    const { runtime, ctx, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();
    const { pkg } = createAuditBundleForBlockedPayment(runtime, ctx, outcome.request.trustDomainId, packageId);
    assert.notEqual(pkg.id, packageId);
    assert.equal(runtime.getPackage(pkg.id)?.type, 'audit_bundle');
  });

  it('4. seals and verifies the new audit_bundle package without a failed status', async () => {
    const { runtime, ctx, packageId, outcome } = await buildPolicyPackDecisionPacketFixture();
    const { pkg } = createAuditBundleForBlockedPayment(runtime, ctx, outcome.request.trustDomainId, packageId);

    runtime.sealPackage(pkg.id);
    const verification = runtime.verifyPackage(pkg.id);
    assert.notEqual(verification.status, 'failed');
  });
});
