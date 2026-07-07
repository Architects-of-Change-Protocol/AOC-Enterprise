import { createEvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { createEvidenceRuntime, type EvidenceRuntime } from '../services/evidence-runtime.js';
import type { SourceDocument } from '../domain/source-document.js';
import type { EvidenceArtifact } from '../domain/evidence-artifact.js';
import {
  createApprovalEvidenceIntegration,
  type ApprovalEvidenceIntegration,
} from '../integrations/approval-evidence-integration.js';

export const NOW = '2026-01-03T00:00:00.000Z';
export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';
export const REQUESTER_ACTOR_ID = 'actor-pmfreak-closure-agent';
export const APPROVER_ACTOR_ID = 'actor-victor-valverde';
export const APPROVE_PAYMENT_ACTION = 'approve_payment';
export const APPROVAL_REQUEST_ID = 'approval-request-datasys-payment-001';
export const APPROVAL_DECISION_ID = 'approval-decision-datasys-payment-001';

export const APPROVAL_MEMO_REQUIREMENT = {
  id: 'approval-evidence-requirement-memo',
  type: 'approval_memo',
  description: 'A written approval memo must support the human approval decision.',
  required: true,
} as const;

export interface ApprovalEvidenceDemoFixture {
  readonly runtime: EvidenceRuntime;
  readonly integration: ApprovalEvidenceIntegration;
  readonly approvalMemoSource: SourceDocument;
  readonly approvalMemoEvidence: EvidenceArtifact;
}

/**
 * Composes a sample Approval Runtime evidence requirement (an approval
 * memo) with the Evidence / Source / Citation Runtime, via the
 * approval-evidence-integration structural adapter.
 */
export function buildApprovalEvidenceDemoFixture(): ApprovalEvidenceDemoFixture {
  const ctx = createEvidenceRuntimeContext(NOW);
  const runtime = createEvidenceRuntime(ctx);
  const integration = createApprovalEvidenceIntegration(runtime);

  const approvalMemoSource = runtime.registerSourceDocument({
    id: 'source-document-approval-memo-payment-001',
    type: 'approval_memo',
    title: 'Approval memo for DataSys payment approval',
    authority: 'internal',
    sourceReference: 'approval_memo:AM-PAY-001',
    trustDomainId: TRUST_DOMAIN_ID,
    demoOnly: true,
    legalCompleteness: 'not_legal_advice',
  });

  const approvalMemoEvidence = runtime.submitEvidenceArtifact({
    id: 'evidence-artifact-approval-memo-payment-001',
    type: 'approval_memo',
    title: 'Approval memo evidence for DataSys payment approval',
    sourceDocumentId: approvalMemoSource.id,
    trustDomainId: TRUST_DOMAIN_ID,
    submittedByActorId: REQUESTER_ACTOR_ID,
  });
  runtime.evidenceArtifacts.accept(approvalMemoEvidence.id, APPROVER_ACTOR_ID);

  integration.createRequirementsForApprovalRequest({
    trustDomainId: TRUST_DOMAIN_ID,
    approvalRequestId: APPROVAL_REQUEST_ID,
    actorId: REQUESTER_ACTOR_ID,
    action: APPROVE_PAYMENT_ACTION,
    requirements: [APPROVAL_MEMO_REQUIREMENT],
  });

  return { runtime, integration, approvalMemoSource, approvalMemoEvidence };
}
