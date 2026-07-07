import { createEvidenceRuntimeContext, type EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import type { SourceDocument } from '../domain/source-document.js';
import type { EvidenceArtifact } from '../domain/evidence-artifact.js';
import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import type { EvidenceSatisfaction } from '../domain/evidence-satisfaction.js';
import type { Citation } from '../domain/citation.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import { EvidenceRuntime, createEvidenceRuntime } from '../services/evidence-runtime.js';

export const NOW = '2026-01-01T00:00:00.000Z';
export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';
export const SUBMITTER_ACTOR_ID = 'actor-pmfreak-closure-agent';
export const REVIEWER_ACTOR_ID = 'actor-victor-valverde';

export const POLICY_DECISION_ID = 'policy-decision-demo-001';
export const APPROVAL_DECISION_ID = 'approval-decision-demo-001';
export const ENFORCEMENT_DECISION_ID = 'enforcement-decision-demo-001';

export interface EvidenceDemoFixture {
  readonly ctx: EvidenceRuntimeContext;
  readonly runtime: EvidenceRuntime;

  readonly invoiceSource: SourceDocument;
  readonly purchaseOrderSource: SourceDocument;
  readonly eventRecordSource: SourceDocument;
  readonly dataClassificationSource: SourceDocument;
  readonly approvalMemoSource: SourceDocument;
  readonly customerPolicySource: SourceDocument;
  readonly staleInvoiceSource: SourceDocument;

  readonly invoiceEvidence: EvidenceArtifact;
  readonly purchaseOrderEvidence: EvidenceArtifact;
  readonly eventRecordEvidence: EvidenceArtifact;
  readonly dataClassificationEvidence: EvidenceArtifact;
  readonly approvalMemoEvidence: EvidenceArtifact;
  readonly rejectedInvoiceEvidence: EvidenceArtifact;

  readonly invoiceRequirement: EvidenceRequirement;
  readonly purchaseOrderRequirement: EvidenceRequirement;
  readonly eventRecordRequirement: EvidenceRequirement;
  readonly dataClassificationRequirement: EvidenceRequirement;

  readonly invoiceSatisfaction: EvidenceSatisfaction;
  readonly eventRecordSatisfaction: EvidenceSatisfaction;

  readonly invoiceToPolicyCitation: Citation;
  readonly approvalMemoToApprovalCitation: Citation;
  readonly eventRecordToEnforcementCitation: Citation;

  readonly policyDecisionProof: EvidenceProof;
  readonly approvalDecisionProof: EvidenceProof;
  readonly enforcementDecisionProof: EvidenceProof;
}

/**
 * Deterministic demo world for the Evidence / Source / Citation Runtime.
 * Every record below is created through the real EvidenceRuntime API (no
 * hand-built domain objects) so this fixture exercises exactly the same
 * code path a production caller would use.
 */
export function buildEvidenceDemoFixture(): EvidenceDemoFixture {
  const ctx = createEvidenceRuntimeContext(NOW);
  const runtime = createEvidenceRuntime(ctx);

  const invoiceSource = runtime.registerSourceDocument({
    id: 'source-document-invoice-001',
    type: 'invoice',
    title: 'Invoice INV-1001 for DataSys engagement',
    authority: 'customer_provided',
    sourceReference: 'invoice:INV-1001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'customer_provided',
  });

  const purchaseOrderSource = runtime.registerSourceDocument({
    id: 'source-document-purchase-order-001',
    type: 'purchase_order',
    title: 'Purchase order PO-2001',
    authority: 'customer_provided',
    sourceReference: 'purchase_order:PO-2001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'customer_provided',
  });

  const eventRecordSource = runtime.registerSourceDocument({
    id: 'source-document-event-record-001',
    type: 'event_record',
    title: 'Sports settlement event record ER-3001',
    authority: 'internal',
    sourceReference: 'event_record:ER-3001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
  });

  const dataClassificationSource = runtime.registerSourceDocument({
    id: 'source-document-data-classification-001',
    type: 'data_classification',
    title: 'Data classification record DC-4001',
    authority: 'internal',
    sourceReference: 'data_classification:DC-4001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
  });

  const approvalMemoSource = runtime.registerSourceDocument({
    id: 'source-document-approval-memo-001',
    type: 'approval_memo',
    title: 'Approval memo AM-5001',
    authority: 'internal',
    sourceReference: 'approval_memo:AM-5001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
  });

  const customerPolicySource = runtime.registerSourceDocument({
    id: 'source-document-customer-policy-001',
    type: 'customer_policy',
    title: 'Customer procurement policy CP-6001',
    authority: 'customer_provided',
    sourceReference: 'customer_policy:CP-6001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'partial_policy_model',
  });

  const staleInvoiceSource = runtime.registerSourceDocument({
    id: 'source-document-invoice-stale-001',
    type: 'invoice',
    title: 'Invoice INV-0999 (superseded)',
    authority: 'customer_provided',
    sourceReference: 'invoice:INV-0999',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'customer_provided',
    effectiveUntil: '2025-12-01T00:00:00.000Z',
  });
  runtime.sourceDocuments.markExpired(staleInvoiceSource.id);

  const invoiceEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-invoice-001',
    type: 'invoice',
    title: 'Invoice evidence for INV-1001',
    sourceDocumentId: invoiceSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: SUBMITTER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(invoiceEvidence.id, REVIEWER_ACTOR_ID);

  const purchaseOrderEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-purchase-order-001',
    type: 'purchase_order',
    title: 'Purchase order evidence for PO-2001',
    sourceDocumentId: purchaseOrderSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: SUBMITTER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(purchaseOrderEvidence.id, REVIEWER_ACTOR_ID);

  const eventRecordEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-event-record-001',
    type: 'event_record',
    title: 'Event record evidence for ER-3001',
    sourceDocumentId: eventRecordSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: SUBMITTER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(eventRecordEvidence.id, REVIEWER_ACTOR_ID);

  const dataClassificationEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-data-classification-001',
    type: 'data_classification',
    title: 'Data classification evidence for DC-4001',
    sourceDocumentId: dataClassificationSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: SUBMITTER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(dataClassificationEvidence.id, REVIEWER_ACTOR_ID);

  const approvalMemoEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-approval-memo-001',
    type: 'approval_memo',
    title: 'Approval memo evidence for AM-5001',
    sourceDocumentId: approvalMemoSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: REVIEWER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(approvalMemoEvidence.id, REVIEWER_ACTOR_ID);

  const rejectedInvoiceEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-invoice-rejected-001',
    type: 'invoice',
    title: 'Invoice evidence for INV-0999 (rejected duplicate)',
    sourceDocumentId: staleInvoiceSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: SUBMITTER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.reject(
    rejectedInvoiceEvidence.id,
    REVIEWER_ACTOR_ID,
    'DUPLICATE_INVOICE',
    'This invoice was already submitted under INV-1001 and its source document has since been superseded.',
  );

  const invoiceRequirement = runtime.requirements.fromPolicyPackRequirement({
    trustDomainId: TRUST_DOMAIN_ID,
    policyDecisionId: POLICY_DECISION_ID,
    requirement: {
      id: 'policy-evidence-requirement-invoice',
      type: 'invoice',
      description: 'An invoice must be attached before invoice support can proceed.',
      required: true,
    },
  });

  const purchaseOrderRequirement = runtime.requirements.fromPolicyPackRequirement({
    trustDomainId: TRUST_DOMAIN_ID,
    policyDecisionId: POLICY_DECISION_ID,
    requirement: {
      id: 'policy-evidence-requirement-purchase-order',
      type: 'purchase_order',
      description: 'A purchase order must be attached before invoice support can proceed.',
      required: true,
    },
  });

  const eventRecordRequirement = runtime.requirements.fromPolicyPackRequirement({
    trustDomainId: TRUST_DOMAIN_ID,
    policyDecisionId: ENFORCEMENT_DECISION_ID,
    requirement: {
      id: 'policy-evidence-requirement-event-record',
      type: 'event_record',
      description: 'An event record must be attached before the sports settlement can proceed.',
      required: true,
    },
  });

  const dataClassificationRequirement = runtime.requirements.fromPolicyPackRequirement({
    trustDomainId: TRUST_DOMAIN_ID,
    policyDecisionId: POLICY_DECISION_ID,
    requirement: {
      id: 'policy-evidence-requirement-data-classification',
      type: 'data_classification',
      description: 'A data classification record must be attached before export review can proceed.',
      required: true,
    },
  });

  const invoiceSatisfaction = runtime.satisfyEvidenceRequirement({
    requirementId: invoiceRequirement.id,
    evidenceArtifactIds: [invoiceEvidence.id],
    satisfiedByActorId: SUBMITTER_ACTOR_ID,
    reviewedByActorId: REVIEWER_ACTOR_ID,
    reasonCode: 'INVOICE_ATTACHED',
    reason: 'Invoice INV-1001 attached and accepted.',
  });

  const eventRecordSatisfaction = runtime.satisfyEvidenceRequirement({
    requirementId: eventRecordRequirement.id,
    evidenceArtifactIds: [eventRecordEvidence.id],
    satisfiedByActorId: SUBMITTER_ACTOR_ID,
    reviewedByActorId: REVIEWER_ACTOR_ID,
    reasonCode: 'EVENT_RECORD_ATTACHED',
    reason: 'Event record ER-3001 attached and accepted.',
  });

  const invoiceToPolicyCitation = runtime.createCitation({
    evidenceArtifactId: invoiceEvidence.id,
    sourceDocumentId: invoiceSource.id,
    targetType: 'policy_decision',
    targetId: POLICY_DECISION_ID,
    reasonCode: 'INVOICE_EVIDENCE_CITED',
    reason: 'Invoice evidence cited in support of the policy decision requiring invoice evidence.',
    createdByActorId: REVIEWER_ACTOR_ID,
  });

  const approvalMemoToApprovalCitation = runtime.createCitation({
    evidenceArtifactId: approvalMemoEvidence.id,
    sourceDocumentId: approvalMemoSource.id,
    targetType: 'approval_decision',
    targetId: APPROVAL_DECISION_ID,
    reasonCode: 'APPROVAL_MEMO_CITED',
    reason: 'Approval memo cited in support of the human approval decision.',
    createdByActorId: REVIEWER_ACTOR_ID,
  });

  const eventRecordToEnforcementCitation = runtime.createCitation({
    evidenceArtifactId: eventRecordEvidence.id,
    sourceDocumentId: eventRecordSource.id,
    targetType: 'enforcement_decision',
    targetId: ENFORCEMENT_DECISION_ID,
    reasonCode: 'EVENT_RECORD_CITED',
    reason: 'Event record cited in support of the enforcement decision for the sports settlement.',
    createdByActorId: REVIEWER_ACTOR_ID,
  });

  const policyDecisionProof = runtime.createEvidenceProof({
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'policy_decision',
    targetId: POLICY_DECISION_ID,
    sourceDocumentIds: [invoiceSource.id],
    evidenceArtifactIds: [invoiceEvidence.id],
    requirementIds: [invoiceRequirement.id],
    satisfactionIds: [invoiceSatisfaction.id],
    citationIds: [invoiceToPolicyCitation.id],
  });

  const approvalDecisionProof = runtime.createEvidenceProof({
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'approval_decision',
    targetId: APPROVAL_DECISION_ID,
    sourceDocumentIds: [approvalMemoSource.id],
    evidenceArtifactIds: [approvalMemoEvidence.id],
    citationIds: [approvalMemoToApprovalCitation.id],
  });

  const enforcementDecisionProof = runtime.createEvidenceProof({
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'enforcement_decision',
    targetId: ENFORCEMENT_DECISION_ID,
    sourceDocumentIds: [eventRecordSource.id],
    evidenceArtifactIds: [eventRecordEvidence.id],
    requirementIds: [eventRecordRequirement.id],
    satisfactionIds: [eventRecordSatisfaction.id],
    citationIds: [eventRecordToEnforcementCitation.id],
  });

  return {
    ctx,
    runtime,
    invoiceSource,
    purchaseOrderSource,
    eventRecordSource,
    dataClassificationSource,
    approvalMemoSource,
    customerPolicySource,
    staleInvoiceSource,
    invoiceEvidence,
    purchaseOrderEvidence,
    eventRecordEvidence,
    dataClassificationEvidence,
    approvalMemoEvidence,
    rejectedInvoiceEvidence,
    invoiceRequirement,
    purchaseOrderRequirement,
    eventRecordRequirement,
    dataClassificationRequirement,
    invoiceSatisfaction,
    eventRecordSatisfaction,
    invoiceToPolicyCitation,
    approvalMemoToApprovalCitation,
    eventRecordToEnforcementCitation,
    policyDecisionProof,
    approvalDecisionProof,
    enforcementDecisionProof,
  };
}
