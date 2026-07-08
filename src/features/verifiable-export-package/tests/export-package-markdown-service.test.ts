import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import type { MarkdownAudience } from '../services/export-package-markdown-service.js';
import { LEGAL_DISCLAIMER } from '../services/export-package-markdown-service.js';
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

interface RenderedPackage {
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/** Builds a fully-verified decision packet spanning summary/enforcement/policy/evidence/citations, so every markdown section renders real content. */
function buildRichVerifiedPackage(): RenderedPackage {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', { text: 'A read action was recognized, authorized, and executed.' });
  const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {
    type: 'execute_allowed',
    allowedToExecute: true,
    reasonCode: 'RECOGNIZED_AND_AUTHORIZED',
    reason: 'The actor is recognized and authorized to perform this action.',
  });
  const proofItem = makeItem(ctx, 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { enforcementDecisionId: 'enforcement-decision-1', proofHash: 'a-proof-hash-value' });
  const policyItem = makeItem(ctx, 'policy_decision', 'domain_policy_pack_runtime', 'policy-decision-1', {
    reason: 'The payments-basic policy pack allowed this action.',
    legalCompleteness: 'illustrative_only',
    demoOnly: true,
  });
  const evidenceItem = makeItem(ctx, 'evidence_artifact', 'evidence_source_runtime', 'evidence-artifact-1', { title: 'Finance review memo' });
  const citationItem = makeItem(ctx, 'citation', 'evidence_source_runtime', 'citation-1', { sourceDocumentId: 'evidence-artifact-1' });

  const { pkg } = runtime.createDecisionPacket({
    title: 'Markdown Rendering Test Package',
    description: 'A fully-populated package for markdown rendering tests.',
    trustDomainId: 'trust-domain-1',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    sections: [
      { type: 'summary', required: true, items: [summaryItem] },
      { type: 'enforcement', required: true, items: [decisionItem, proofItem] },
      { type: 'policy', required: false, items: [policyItem] },
      { type: 'evidence', required: false, items: [evidenceItem] },
      { type: 'citations', required: false, items: [citationItem] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);
  return { runtime, packageId: pkg.id };
}

const AUDIENCES: readonly MarkdownAudience[] = ['buyer', 'technical', 'auditor'];

describe('ExportPackageMarkdownService', () => {
  it('1. renders for all three audiences without throwing, each containing the package title', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const pkg = required(runtime.getPackage(packageId), 'Expected a package.');

    for (const audience of AUDIENCES) {
      const markdown = runtime.renderMarkdownSummary(packageId, audience);
      assert.equal(typeof markdown, 'string');
      assert.ok(markdown.length > 0);
      assert.ok(markdown.includes(pkg.title));
    }
  });

  it('2. includes a Decision Summary section header', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const markdown = runtime.renderMarkdownSummary(packageId, 'buyer');
    assert.ok(markdown.includes('## Decision Summary'));
  });

  it('3. includes the package hash and manifest hash', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const pkg = required(runtime.getPackage(packageId), 'Expected a package.');
    const manifest = required(runtime.getPackageManifest(packageId), 'Expected a manifest.');
    const markdown = runtime.renderMarkdownSummary(packageId, 'auditor');

    assert.ok(markdown.includes('Package hash'));
    assert.ok(markdown.includes('Manifest hash'));
    const packageHash = required(pkg.packageHash, 'Expected a sealed package hash.');
    assert.ok(markdown.includes(packageHash.slice(0, 16)));
    assert.ok(markdown.includes(manifest.manifestHash.slice(0, 16)));
  });

  it('4. lists every section title under a Sections summary', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const pkg = required(runtime.getPackage(packageId), 'Expected a package.');
    const markdown = runtime.renderMarkdownSummary(packageId, 'technical');

    assert.ok(markdown.includes('## Sections'));
    for (const section of pkg.sections) {
      assert.ok(markdown.includes(section.title));
    }
  });

  it('5. includes a Policy section header', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const markdown = runtime.renderMarkdownSummary(packageId, 'buyer');
    assert.ok(markdown.includes('## Policy'));
  });

  it('6. includes an Evidence & Citations section header', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const markdown = runtime.renderMarkdownSummary(packageId, 'buyer');
    assert.ok(markdown.includes('## Evidence & Citations'));
  });

  it('7. includes an Enforcement section header', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const markdown = runtime.renderMarkdownSummary(packageId, 'buyer');
    assert.ok(markdown.includes('## Enforcement'));
  });

  it('8. includes the verification status', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const verification = required(runtime.getPackageVerification(packageId), 'Expected a verification.');
    const markdown = runtime.renderMarkdownSummary(packageId, 'auditor');
    assert.ok(markdown.includes(verification.status));
  });

  it('9. includes the legal disclaimer', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const markdown = runtime.renderMarkdownSummary(packageId, 'buyer');
    assert.ok(markdown.includes(LEGAL_DISCLAIMER));
    assert.ok(markdown.toLowerCase().includes('not legal advice'));
  });

  it('10. never overclaims compliance', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    for (const audience of AUDIENCES) {
      const markdown = runtime.renderMarkdownSummary(packageId, audience).toLowerCase();
      assert.ok(!markdown.includes('is compliant'));
      assert.ok(!markdown.includes('compliance verified'));
      assert.ok(!markdown.includes('proves compliance'));
      assert.ok(!markdown.includes('guarantees compliance'));
    }
  });

  it('11. produces deterministic output for the same package and audience', () => {
    const { runtime, packageId } = buildRichVerifiedPackage();
    const first = runtime.renderMarkdownSummary(packageId, 'technical');
    const second = runtime.renderMarkdownSummary(packageId, 'technical');
    assert.equal(first, second);
  });
});
