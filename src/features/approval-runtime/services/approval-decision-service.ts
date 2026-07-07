import type { ApprovalDecision, ApprovalDecisionType } from '../domain/approval-decision.js';
import type { ApprovalEvidenceArtifact } from '../domain/approval-evidence.js';
import type { ApprovalPolicyContext } from '../domain/approval-policy.js';
import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import { createAdmissionApprovalPolicyChain, QuorumPolicy } from '../policies/index.js';
import type { ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import type { ApprovalActorRecognitionIntegration } from './approval-actor-recognition-integration.js';
import type { ApprovalAuthorityGraphIntegration } from './approval-authority-graph-integration.js';
import type { ApprovalLedger } from './approval-ledger.js';
import { ApprovalPolicyEvaluator } from './approval-policy-evaluator.js';
import type { ApprovalProofService } from './approval-proof-service.js';
import type { ApprovalRequestService } from './approval-request-service.js';
import type { ApprovalStore } from './approval-store.js';

export type ApprovalDecisionAttemptType = 'approved' | 'rejected' | 'requested_changes' | 'escalated';

export interface SubmitApprovalDecisionInput {
  readonly approvalRequestId: string;
  readonly approverActorId: string;
  readonly type: ApprovalDecisionAttemptType;
  readonly evidenceReviewed?: readonly ApprovalEvidenceArtifact[];
  readonly reason?: string;
}

export interface ApprovalDecisionSubmissionResult {
  readonly decision: ApprovalDecision;
  readonly request?: ApprovalRequest;
  readonly proof?: ApprovalProof;
  readonly quorumMet: boolean;
}

const TERMINAL_EVENT_BY_DECISION_TYPE: Readonly<Partial<Record<ApprovalDecisionType, 'approval_approved' | 'approval_rejected' | 'approval_changes_requested' | 'approval_escalated' | 'approval_expired' | 'approval_revoked'>>> = {
  approved: 'approval_approved',
  rejected: 'approval_rejected',
  requested_changes: 'approval_changes_requested',
  escalated: 'approval_escalated',
  expired: 'approval_expired',
  revoked: 'approval_revoked',
};

export class ApprovalDecisionService {
  private readonly admissionEvaluator = new ApprovalPolicyEvaluator(createAdmissionApprovalPolicyChain());
  private readonly quorumPolicy = new QuorumPolicy();

  constructor(
    private readonly ctx: ApprovalRuntimeContext,
    private readonly store: ApprovalStore,
    private readonly ledger: ApprovalLedger,
    private readonly requestService: ApprovalRequestService,
    private readonly proofService: ApprovalProofService,
    private readonly recognition: ApprovalActorRecognitionIntegration,
    private readonly authorityGraph?: ApprovalAuthorityGraphIntegration,
  ) {}

  approve(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.submitApprovalDecision({ ...input, type: 'approved' });
  }

  reject(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.submitApprovalDecision({ ...input, type: 'rejected' });
  }

  requestChanges(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.submitApprovalDecision({ ...input, type: 'requested_changes' });
  }

  escalate(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.submitApprovalDecision({ ...input, type: 'escalated' });
  }

  submitApprovalDecision(input: SubmitApprovalDecisionInput): ApprovalDecisionSubmissionResult {
    const now = this.ctx.clock.now();
    const request = this.store.getRequest(input.approvalRequestId);
    const evidenceReviewed = input.evidenceReviewed ?? [];
    const priorDecisions = request ? this.store.getDecisionsByRequestId(request.id) : [];

    const authorityCheck = this.checkApproverAuthority(request, input.approverActorId, now);

    const context: ApprovalPolicyContext = {
      now,
      attempt: { approverActorId: input.approverActorId, type: input.type, evidenceReviewed },
      approverRecognition: this.recognition.getApproverRecognitionStatus(input.approverActorId),
      priorDecisions,
      ...(request !== undefined ? { request } : {}),
      ...(authorityCheck !== undefined ? { authorityCheck } : {}),
    };

    const evaluation = this.admissionEvaluator.evaluate(context);

    const decision: ApprovalDecision = {
      id: this.ctx.ids.nextId('approval-decision'),
      approvalRequestId: input.approvalRequestId,
      trustDomainId: request?.trustDomainId ?? 'unknown',
      approverActorId: input.approverActorId,
      type: evaluation.decisionType,
      approved: evaluation.decisionType === 'approved',
      reasonCode: evaluation.reasonCode,
      reason: input.reason ?? evaluation.reason,
      evidenceReviewed,
      decidedAt: now,
      ...(authorityCheck?.authorityDecisionId !== undefined ? { authorityDecisionId: authorityCheck.authorityDecisionId } : {}),
      ...(authorityCheck?.authorityProofId !== undefined ? { authorityProofId: authorityCheck.authorityProofId } : {}),
    };
    this.store.putDecision(decision);

    const eventType = TERMINAL_EVENT_BY_DECISION_TYPE[decision.type];
    const failingPolicyId = evaluation.passed ? undefined : evaluation.policyResults.at(-1)?.policyId;

    // Lazily catch a request whose expiry has passed but was never swept -- keep the store consistent.
    let effectiveRequest = request;
    if (!evaluation.passed && failingPolicyId === 'expiration' && request && request.status === 'pending') {
      effectiveRequest = this.requestService.markExpired(request.id);
    }

    if (!evaluation.passed) {
      if (eventType !== undefined && effectiveRequest) {
        this.ledger.recordEvent({
          type: eventType,
          trustDomainId: effectiveRequest.trustDomainId,
          approvalRequestId: effectiveRequest.id,
          approvalDecisionId: decision.id,
          approverActorId: input.approverActorId,
          actionRequestId: effectiveRequest.actionRequestId,
          payload: { reasonCode: decision.reasonCode },
        });
      }
      return { decision, quorumMet: false, ...(effectiveRequest !== undefined ? { request: effectiveRequest } : {}) };
    }

    // From here, request is guaranteed defined: ValidApprovalRequestPolicy passed.
    const validRequest = effectiveRequest as ApprovalRequest;

    if (decision.type === 'rejected') {
      const rejected = this.requestService.markRejected(validRequest.id);
      this.recordDecisionEvent('approval_rejected', rejected, decision);
      return { decision, request: rejected, quorumMet: false };
    }

    if (decision.type === 'requested_changes') {
      this.recordDecisionEvent('approval_changes_requested', validRequest, decision);
      return { decision, request: validRequest, quorumMet: false };
    }

    if (decision.type === 'escalated') {
      this.recordDecisionEvent('approval_escalated', validRequest, decision);
      return { decision, request: validRequest, quorumMet: false };
    }

    // decision.type === 'approved'
    this.recordDecisionEvent('approval_approved', validRequest, decision);

    // QuorumPolicy folds the current 'approved' attempt into its count itself, so priorDecisions
    // (which does not yet include `decision`) is exactly the right context to reuse here.
    const quorumOutcome = this.quorumPolicy.evaluate({ ...context, request: validRequest });
    const quorumMet = quorumOutcome.passed;

    if (!quorumMet) {
      return { decision, request: validRequest, quorumMet: false };
    }

    const approvedRequest = this.requestService.markApproved(validRequest.id);
    const allApprovedDecisions = [...priorDecisions, decision].filter((d) => d.type === 'approved');
    const combinedEvidence = allApprovedDecisions.flatMap((d) => d.evidenceReviewed);

    const proof = this.proofService.createProof({
      approvalRequestId: approvedRequest.id,
      approvalDecisionId: decision.id,
      trustDomainId: approvedRequest.trustDomainId,
      actionRequestId: approvedRequest.actionRequestId,
      requestedByActorId: approvedRequest.requestedByActorId,
      approverActorId: decision.approverActorId,
      action: approvedRequest.action,
      resourceScope: approvedRequest.resourceScope,
      approved: true,
      evidence: combinedEvidence,
      ...(approvedRequest.principalActorId !== undefined ? { principalActorId: approvedRequest.principalActorId } : {}),
      ...(decision.authorityDecisionId !== undefined ? { authorityDecisionId: decision.authorityDecisionId } : {}),
      ...(decision.authorityProofId !== undefined ? { authorityProofId: decision.authorityProofId } : {}),
      ...(approvedRequest.expiresAt !== undefined ? { expiresAt: approvedRequest.expiresAt } : {}),
    });

    this.ledger.recordEvent({
      type: 'approval_proof_created',
      trustDomainId: approvedRequest.trustDomainId,
      approvalRequestId: approvedRequest.id,
      approvalDecisionId: decision.id,
      approvalProofId: proof.id,
      actionRequestId: approvedRequest.actionRequestId,
      payload: { proofHash: proof.proofHash },
    });

    return { decision, request: approvedRequest, proof, quorumMet: true };
  }

  private checkApproverAuthority(request: ApprovalRequest | undefined, approverActorId: string, now: string) {
    const requiredCapability = request?.requirement.requiredAuthorityCapability;
    if (!request || requiredCapability === undefined || !this.authorityGraph) {
      return undefined;
    }
    const result = this.authorityGraph.verifyAuthority({
      requestId: request.id,
      actorId: approverActorId,
      trustDomainId: request.trustDomainId,
      action: requiredCapability,
      resourceScope: request.resourceScope,
      requestedAt: now,
      ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
    });
    return result;
  }

  private recordDecisionEvent(
    eventType: 'approval_approved' | 'approval_rejected' | 'approval_changes_requested' | 'approval_escalated',
    request: ApprovalRequest,
    decision: ApprovalDecision,
  ): void {
    this.ledger.recordEvent({
      type: eventType,
      trustDomainId: request.trustDomainId,
      approvalRequestId: request.id,
      approvalDecisionId: decision.id,
      approverActorId: decision.approverActorId,
      actionRequestId: request.actionRequestId,
      payload: { reasonCode: decision.reasonCode },
    });
  }
}
