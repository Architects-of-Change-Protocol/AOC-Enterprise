import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementDecision } from '../../../action-enforcement/domain/enforcement-decision.js';
import type { EvidenceProof } from '../../../evidence-source-runtime/domain/evidence-proof.js';
import { createDigest } from '../../domain/export-package.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../../domain/export-package-item.js';
import { createExportPackageRuntime } from '../../services/export-package-runtime.js';
import { mapEnforcementDecisionToItem } from '../../integrations/action-enforcement-export-adapter.js';
import { mapEvidenceProofToItem } from '../../integrations/evidence-export-adapter.js';

const NOW = '2026-02-02T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';

// The REQUIRED_SECTIONS_BY_PACKAGE_TYPE list always requires a non-empty
// `summary` section (regardless of the `required` flag passed when building
// it), so every hand-built package here carries one real summary_text item.
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

const SETTLEMENT_EVIDENCE_REQUIRED_DECISION: EnforcementDecision = {
  id: 'enforcement-decision-settlement-evidence-001',
  enforcementRequestId: 'enforcement-request-settlement-evidence-001',
  type: 'evidence_required',
  allowedToExecute: false,
  reasonCode: 'EVENT_RECORD_EVIDENCE_REQUIRED',
  reason: 'settle_event_payment requires event_record evidence, which has not been attached.',
  decidedAt: NOW,
  policyResults: [],
};

const SETTLEMENT_EVIDENCE_PROOF: EvidenceProof = {
  id: 'evidence-proof-settlement-001',
  trustDomainId: TRUST_DOMAIN_ID,
  sourceDocumentIds: [],
  evidenceArtifactIds: ['evidence-artifact-event-record-001'],
  requirementIds: ['evidence-requirement-event-record-001'],
  satisfactionIds: [],
  reviewIds: [],
  citationIds: [],
  evidenceLinkIds: [],
  targetType: 'enforcement_decision',
  targetId: SETTLEMENT_EVIDENCE_REQUIRED_DECISION.id,
  sourceHash: 'source-hash-settlement-demo',
  evidenceHash: 'evidence-hash-settlement-demo',
  requirementHash: 'requirement-hash-settlement-demo',
  satisfactionHash: 'satisfaction-hash-settlement-demo',
  reviewHash: 'review-hash-settlement-demo',
  citationHash: 'citation-hash-settlement-demo',
  linkHash: 'link-hash-settlement-demo',
  proofHash: 'proof-hash-settlement-demo',
  createdAt: NOW,
};

function buildSettlementPackage(includeEvidenceProof: boolean) {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const enforcementDecisionItem = mapEnforcementDecisionToItem(ctx, SETTLEMENT_EVIDENCE_REQUIRED_DECISION);
  const evidenceItems = includeEvidenceProof ? [mapEvidenceProofToItem(ctx, SETTLEMENT_EVIDENCE_PROOF)] : [];
  const summaryItem = buildSummaryItem(ctx, 'summary-settlement-evidence-001', 'settle_event_payment is blocked pending event_record evidence.');

  const { pkg } = runtime.createEnforcementDecisionPacket({
    title: 'Enforcement decision packet: settle_event_payment (evidence required)',
    description: 'Package for a sports-event-settlement payment blocked pending event_record evidence.',
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'enforcement_decision',
    targetId: SETTLEMENT_EVIDENCE_REQUIRED_DECISION.id,
    sections: [
      { type: 'summary', required: true, items: [summaryItem] },
      { type: 'enforcement', required: true, items: [enforcementDecisionItem] },
      { type: 'evidence', required: false, items: evidenceItems },
    ],
  });

  runtime.sealPackage(pkg.id);
  const verification = runtime.verifyPackage(pkg.id);

  return { ctx, runtime, packageId: pkg.id, verification };
}

describe('export scenario: sports event settlement evidence packet', () => {
  it('1. the enforcement decision shows an evidence requirement was needed for settle_event_payment', () => {
    const { runtime, packageId } = buildSettlementPackage(false);
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    const decisionItem = enforcementSection?.items.find((item) => item.sourceId === SETTLEMENT_EVIDENCE_REQUIRED_DECISION.id);
    assert.equal(decisionItem?.payload['type'], 'evidence_required');
    assert.equal(decisionItem?.payload['allowedToExecute'], false);
    assert.equal(decisionItem?.payload['reasonCode'], 'EVENT_RECORD_EVIDENCE_REQUIRED');
  });

  // The evidence proof's own `evidenceArtifactIds`/`requirementIds` name a
  // real evidence artifact and requirement, but this minimal package does
  // not itself include an `evidence_artifact`/`evidence_requirement` item
  // for either id -- so the reference resolver correctly reports both as
  // missing, and the section status is promoted from `included` to
  // `incomplete` (never silently dropped). `incomplete`, not `not_available`,
  // is exactly how this feature is supposed to represent "evidence is
  // attached, but not every referenced fact was included."
  it('2. with the evidence proof included, the evidence section has real content but is marked incomplete for the artifact/requirement it references but does not include', () => {
    const { runtime, packageId, verification } = buildSettlementPackage(true);
    const pkg = runtime.getPackage(packageId);
    const evidenceSection = pkg?.sections.find((section) => section.type === 'evidence');
    assert.equal(evidenceSection?.status, 'incomplete');
    assert.ok((evidenceSection?.itemCount ?? 0) > 0);
    assert.ok((evidenceSection?.missingReferenceIds.length ?? 0) > 0);
    assert.notEqual(verification.status, 'failed');
  });

  it('3. without the evidence proof, the package still builds and seals -- missing evidence is not a crash', () => {
    const { runtime, packageId } = buildSettlementPackage(false);
    const pkg = runtime.getPackage(packageId);
    assert.ok(pkg !== undefined);
    assert.equal(typeof pkg?.packageHash, 'string');
    assert.ok((pkg?.packageHash?.length ?? 0) > 0);
  });

  it('4. without the evidence proof, the evidence section is left not_available', () => {
    const { runtime, packageId } = buildSettlementPackage(false);
    const pkg = runtime.getPackage(packageId);
    const evidenceSection = pkg?.sections.find((section) => section.type === 'evidence');
    assert.equal(evidenceSection?.status, 'not_available');
  });
});
