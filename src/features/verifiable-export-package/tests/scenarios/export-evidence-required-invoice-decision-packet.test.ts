import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementDecision } from '../../../action-enforcement/domain/enforcement-decision.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import { createExportPackageRuntime } from '../../services/export-package-runtime.js';
import { mapEnforcementDecisionToItem } from '../../integrations/action-enforcement-export-adapter.js';

const NOW = '2026-02-01T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';

const INVOICE_EVIDENCE_REQUIRED_DECISION: EnforcementDecision = {
  id: 'enforcement-decision-invoice-evidence-001',
  enforcementRequestId: 'enforcement-request-invoice-evidence-001',
  type: 'evidence_required',
  allowedToExecute: false,
  reasonCode: 'PURCHASE_ORDER_EVIDENCE_REQUIRED',
  reason: 'prepare_invoice_support requires purchase_order evidence, which has not been declared.',
  decidedAt: NOW,
  policyResults: [],
};

function buildEvidenceRequiredInvoicePackage() {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const enforcementDecisionItem = mapEnforcementDecisionToItem(ctx, INVOICE_EVIDENCE_REQUIRED_DECISION);

  const { pkg } = runtime.createEnforcementDecisionPacket({
    title: 'Enforcement decision packet: prepare_invoice_support (evidence required)',
    description: 'Package for a blocked prepare_invoice_support action, pending purchase_order evidence.',
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'enforcement_decision',
    targetId: INVOICE_EVIDENCE_REQUIRED_DECISION.id,
    sections: [
      { type: 'summary', required: true, items: [] },
      { type: 'enforcement', required: true, items: [enforcementDecisionItem] },
      { type: 'evidence', required: false, items: [] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);

  return { ctx, runtime, packageId: pkg.id };
}

describe('export scenario: evidence-required invoice decision packet', () => {
  it('1. includes the evidence_required enforcement decision, not allowed to execute', () => {
    const { runtime, packageId } = buildEvidenceRequiredInvoicePackage();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    const decisionItem = enforcementSection?.items.find((item) => item.sourceId === INVOICE_EVIDENCE_REQUIRED_DECISION.id);
    assert.ok(decisionItem !== undefined);
    assert.equal(decisionItem?.payload['type'], 'evidence_required');
    assert.equal(decisionItem?.payload['allowedToExecute'], false);
  });

  it('2. never claims the action was executed on the enforcement decision item', () => {
    const { runtime, packageId } = buildEvidenceRequiredInvoicePackage();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    const decisionItem = enforcementSection?.items.find((item) => item.sourceId === INVOICE_EVIDENCE_REQUIRED_DECISION.id);
    assert.ok(!decisionItem?.payload['executed']);
  });

  it('3. leaves the evidence section not_available since no evidence was ever attached', () => {
    const { runtime, packageId } = buildEvidenceRequiredInvoicePackage();
    const pkg = runtime.getPackage(packageId);
    const evidenceSection = pkg?.sections.find((section) => section.type === 'evidence');
    assert.ok(evidenceSection !== undefined);
    assert.equal(evidenceSection?.status, 'not_available');
    assert.equal(evidenceSection?.itemCount, 0);
  });

  it('4. still builds and seals a package hash despite the missing evidence', () => {
    const { runtime, packageId } = buildEvidenceRequiredInvoicePackage();
    const pkg = runtime.getPackage(packageId);
    assert.equal(typeof pkg?.packageHash, 'string');
    assert.ok((pkg?.packageHash?.length ?? 0) > 0);
  });

  it('5. does not render an "Executed: `true`" line in the markdown summary', () => {
    const { runtime, packageId } = buildEvidenceRequiredInvoicePackage();
    const markdown = runtime.renderMarkdownSummary(packageId);
    assert.ok(!markdown.includes('Executed: `true`'));
  });

  it('6. reports the enforcement decision reason explaining the missing evidence', () => {
    const { runtime, packageId } = buildEvidenceRequiredInvoicePackage();
    const markdown = runtime.renderMarkdownSummary(packageId);
    assert.ok(markdown.includes('purchase_order evidence'));
  });
});
