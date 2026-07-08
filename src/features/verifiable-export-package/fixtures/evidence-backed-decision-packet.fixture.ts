import { buildPolicyPackEnforcementFixture, type PolicyPackEnforcementFixture } from '../../action-enforcement/fixtures/policy-pack-enforcement.fixture.js';
import {
  APPROVE_PAYMENT,
  PROJECT_SCOPE,
  TRUST_DOMAIN_ID,
  VICTOR_ACTOR_ID,
  PMFREAK_ACTOR_ID,
  PMFREAK_PAYMENT_TOKEN_ID,
} from '../../action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { buildDemoPolicyPackRuntime } from '../../domain-policy-pack-runtime/fixtures/domain-policy-pack-demo.fixture.js';
import type { PolicyPackDecision } from '../../domain-policy-pack-runtime/domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../../domain-policy-pack-runtime/domain/policy-pack-proof.js';
import type { ApprovalDecision } from '../../approval-runtime/domain/approval-decision.js';
import type { ApprovalProof } from '../../approval-runtime/domain/approval-proof.js';
import { buildApprovalEvidenceDemoFixture } from '../../evidence-source-runtime/fixtures/approval-evidence-demo.fixture.js';
import type { EvidenceProof } from '../../evidence-source-runtime/domain/evidence-proof.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../domain/export-runtime-context.js';
import { ExportPackageRuntime, createExportPackageRuntime } from '../services/export-package-runtime.js';
import { buildSummaryTextItem } from '../services/export-package-section-builder.js';
import { mapPolicyDecisionToItem, mapPolicyProofToItem } from '../integrations/policy-pack-export-adapter.js';
import { mapApprovalDecisionToItem, mapApprovalProofToItem } from '../integrations/approval-export-adapter.js';
import { mapEnforcementDecisionToItem } from '../integrations/action-enforcement-export-adapter.js';
import { mapEvidenceProofToItem, mapEvidenceArtifactToItem, mapCitationToItem } from '../integrations/evidence-export-adapter.js';

export const NOW = '2026-01-08T00:00:00.000Z';
export const POLICY_NOW = '2026-01-08T00:00:00.000Z';

export interface EvidenceBackedDecisionPacketFixture {
  readonly enforcementFixture: PolicyPackEnforcementFixture;
  readonly policyDecision: PolicyPackDecision;
  readonly policyProof: PolicyPackProof;
  readonly approvalDecision: ApprovalDecision;
  readonly approvalProof: ApprovalProof;
  readonly evidenceProof: EvidenceProof;
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/**
 * Composes real output from four runtimes -- Domain Policy Pack Runtime, an
 * Approval Runtime approval, Action Enforcement's own enforcement decision,
 * and an Evidence / Source / Citation Runtime proof with a citation -- into
 * one evidence-backed decision packet. Every included fact is produced by a
 * real runtime call; this fixture never invents a decision, proof, or
 * citation.
 */
export async function buildEvidenceBackedDecisionPacketFixture(): Promise<EvidenceBackedDecisionPacketFixture> {
  const enforcementFixture = buildPolicyPackEnforcementFixture();

  const policyPackRuntime = buildDemoPolicyPackRuntime(POLICY_NOW);
  const policyResult = policyPackRuntime.evaluatePolicy({
    id: 'policy-eval-evidence-backed-001',
    trustDomainId: TRUST_DOMAIN_ID,
    actorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    action: APPROVE_PAYMENT,
    capability: 'payments.approval',
    resourceScope: PROJECT_SCOPE,
    domain: 'payments',
    riskLevel: 'critical',
    requestedAt: POLICY_NOW,
  });
  if (policyResult.proof === undefined) {
    throw new Error('Expected the payments-basic policy pack to produce a proof for approve_payment.');
  }
  const policyDecision = policyResult.decision;
  const policyProof = policyResult.proof;

  // The approver must be independent of both the requester and the target
  // actor -- Approval Runtime's segregation-of-duties policy rejects a
  // self-approval, so this uses a dedicated finance-reviewer actor rather
  // than Victor (the request's own targetActorId) approving himself.
  const FINANCE_REVIEWER_ACTOR_ID = 'actor-finance-reviewer-independent';
  enforcementFixture.approvalRuntime.registerApproverRecognitionStatus(FINANCE_REVIEWER_ACTOR_ID, 'recognized');

  const approvalRequestReference = enforcementFixture.approvalRuntime.createApprovalRequestForDecision({
    trustDomainId: TRUST_DOMAIN_ID,
    actionRequestId: 'action-request-evidence-backed-001',
    recognitionDecisionId: 'recognition-decision-evidence-backed-001',
    requestedByActorId: PMFREAK_ACTOR_ID,
    targetActorId: VICTOR_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    action: APPROVE_PAYMENT,
    resourceScope: PROJECT_SCOPE,
    capability: 'payments.approval',
    riskLevel: 'critical',
  });
  const approvalSubmission = enforcementFixture.approvalRuntime.approve({
    approvalRequestId: approvalRequestReference.approvalRequestId,
    approverActorId: FINANCE_REVIEWER_ACTOR_ID,
    reason: 'Finance review complete; payment approved.',
  });
  if (approvalSubmission.proof === undefined) {
    throw new Error('Expected an approval proof for an approved decision.');
  }
  const approvalDecision = approvalSubmission.decision;
  const approvalProof = approvalSubmission.proof;

  const evidenceFixture = buildApprovalEvidenceDemoFixture();
  const evidenceProof = evidenceFixture.runtime.createEvidenceProof({
    trustDomainId: TRUST_DOMAIN_ID,
    evidenceArtifactIds: [evidenceFixture.approvalMemoEvidence.id],
    targetType: 'approval_decision',
    targetId: approvalDecision.id,
  });
  const citation = evidenceFixture.runtime.createCitation({
    sourceDocumentId: evidenceFixture.approvalMemoSource.id,
    targetType: 'policy_decision',
    targetId: policyDecision.id,
    reasonCode: 'APPROVAL_MEMO_SUPPORTS_POLICY_DECISION',
    reason: 'The approval memo documents the finance review this policy decision required.',
  });

  const enforcementOutcome = await enforcementFixture.policyPackAocGuard.enforce(
    {
      actorId: PMFREAK_ACTOR_ID,
      principalActorId: VICTOR_ACTOR_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      action: APPROVE_PAYMENT,
      resourceScope: PROJECT_SCOPE,
      capability: 'payments.approval',
      sideEffectType: 'financial',
      riskLevel: 'critical',
      metadata: { passportId: 'passport-pmfreak', capabilityTokenId: PMFREAK_PAYMENT_TOKEN_ID },
      policyEvaluationInput: { domain: 'payments', evidenceIds: ['invoice-1'] },
    },
    () => 'payment approved',
  );

  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const { pkg } = runtime.createEvidencePacket({
    title: `Evidence-backed decision packet: ${APPROVE_PAYMENT}`,
    description: 'Complete verifiable evidence-backed decision packet spanning policy, approval, enforcement, and evidence.',
    trustDomainId: TRUST_DOMAIN_ID,
    targetType: 'policy_decision',
    targetId: policyDecision.id,
    sections: [
      {
        type: 'summary',
        required: true,
        items: [buildSummaryTextItem(ctx, `${APPROVE_PAYMENT} is backed by a policy decision, an approval decision, an enforcement decision, and evidence with a citation.`)],
      },
      { type: 'policy', required: false, items: [mapPolicyDecisionToItem(ctx, policyDecision), mapPolicyProofToItem(ctx, policyProof)] },
      { type: 'approval', required: false, items: [mapApprovalDecisionToItem(ctx, approvalDecision), mapApprovalProofToItem(ctx, approvalProof)] },
      { type: 'enforcement', required: false, items: [mapEnforcementDecisionToItem(ctx, enforcementOutcome.decision)] },
      {
        type: 'evidence',
        required: true,
        items: [mapEvidenceProofToItem(ctx, evidenceProof), mapEvidenceArtifactToItem(ctx, evidenceFixture.approvalMemoEvidence)],
      },
      { type: 'citations', required: false, items: [mapCitationToItem(ctx, citation)] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);

  return { enforcementFixture, policyDecision, policyProof, approvalDecision, approvalProof, evidenceProof, ctx, runtime, packageId: pkg.id };
}
