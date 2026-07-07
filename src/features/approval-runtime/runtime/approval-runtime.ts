import type { ApprovalDecision } from '../domain/approval-decision.js';
import type { ApprovalEvent } from '../domain/approval-event.js';
import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement, ApprovalRiskLevel } from '../domain/approval-requirement.js';
import type { ApprovalRequestStatus } from '../domain/approval-status.js';
import type { ApproverResolution } from '../domain/approver-resolution.js';
import type { ApproverRule } from '../domain/approver-rule.js';
import type { ApprovalVerificationInput, ApprovalVerificationResult, ApprovalVerificationResultType } from '../domain/approval-verification.js';
import {
  createActorRegistryRecognitionIntegration,
  createStoreApprovalActorRecognitionIntegration,
  type ApprovalActorRegistryLike,
} from '../services/approval-actor-recognition-integration.js';
import {
  createApprovalAuthorityGraphIntegration,
  type ApprovalAuthorityGraphIntegration,
  type AuthorityGraphRuntimeLike,
} from '../services/approval-authority-graph-integration.js';
import { ApprovalDecisionService, type ApprovalDecisionSubmissionResult, type SubmitApprovalDecisionInput } from '../services/approval-decision-service.js';
import { ApprovalExpirationService } from '../services/approval-expiration-service.js';
import { ApprovalLedger, type ApprovalEventTrailFilter } from '../services/approval-ledger.js';
import { ApprovalProofService } from '../services/approval-proof-service.js';
import { ApprovalRequestService, type CreateApprovalRequestInput } from '../services/approval-request-service.js';
import { ApprovalRevocationService } from '../services/approval-revocation-service.js';
import { ApprovalStore } from '../services/approval-store.js';
import { ApproverResolutionService, type ApproverRoleLookup, type ResolveApproversInput } from '../services/approver-resolution-service.js';
import type { ApprovalRuntimeContext } from './approval-runtime-context.js';

export interface ApprovalRuntimeOptions {
  /** Structurally-typed AuthorityGraphRuntime (or compatible object) used to verify approver authority. */
  readonly authorityGraph?: AuthorityGraphRuntimeLike;
  /** Structurally-typed Recognition Runtime ActorRegistry (or compatible object) used to check approver recognition. */
  readonly actorRegistry?: ApprovalActorRegistryLike;
  /** Reverse role lookup (roleId -> actorIds) used to resolve role-based approver rules/requirements. */
  readonly roleLookup?: ApproverRoleLookup;
}

export interface RevokeApprovalInput {
  readonly approvalRequestId?: string;
  readonly approvalProofId?: string;
  readonly revokedByActorId: string;
  readonly reason: string;
}

/**
 * Mirrors Recognition Runtime's local CreateApprovalRequestForDecisionInput /
 * ApprovalRequestReference shapes field-for-field so an ApprovalRuntime
 * instance structurally satisfies Recognition Runtime's optional
 * ApprovalRuntimeIntegration.createApprovalRequestForDecision without either
 * feature importing the other's types.
 */
export interface CreateApprovalRequestForDecisionInput {
  readonly recognitionDecisionId: string;
  readonly actionRequestId: string;
  readonly trustDomainId: string;
  readonly requestedByActorId: string;
  readonly targetActorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly riskLevel: ApprovalRiskLevel;
}

export interface ApprovalRequestReference {
  readonly approvalRequestId: string;
  readonly status: ApprovalRequestStatus;
}

const VERIFICATION_TYPE_BY_REQUEST_STATUS: Readonly<Record<string, ApprovalVerificationResultType>> = {
  expired: 'approval_expired',
  revoked: 'approval_revoked',
  rejected: 'approval_invalid',
  cancelled: 'approval_invalid',
  superseded: 'approval_invalid',
};

export class ApprovalRuntime {
  readonly store: ApprovalStore;
  readonly ledger: ApprovalLedger;
  readonly requestService: ApprovalRequestService;
  readonly resolutionService: ApproverResolutionService;
  readonly decisionService: ApprovalDecisionService;
  readonly proofService: ApprovalProofService;
  readonly expirationService: ApprovalExpirationService;
  readonly revocationService: ApprovalRevocationService;
  readonly authorityGraph: ApprovalAuthorityGraphIntegration | undefined;

  constructor(
    private readonly ctx: ApprovalRuntimeContext,
    options: ApprovalRuntimeOptions = {},
  ) {
    this.store = new ApprovalStore();
    this.ledger = new ApprovalLedger(ctx);
    this.requestService = new ApprovalRequestService(ctx, this.store, this.ledger);
    this.proofService = new ApprovalProofService(ctx, this.store);
    this.authorityGraph = options.authorityGraph ? createApprovalAuthorityGraphIntegration(options.authorityGraph) : undefined;
    const recognition = options.actorRegistry
      ? createActorRegistryRecognitionIntegration(options.actorRegistry)
      : createStoreApprovalActorRecognitionIntegration(this.store);
    this.resolutionService = new ApproverResolutionService(
      ctx,
      this.store,
      this.ledger,
      recognition,
      this.authorityGraph,
      options.roleLookup ?? (() => []),
    );
    this.decisionService = new ApprovalDecisionService(
      ctx,
      this.store,
      this.ledger,
      this.requestService,
      this.proofService,
      recognition,
      this.authorityGraph,
    );
    this.expirationService = new ApprovalExpirationService(ctx, this.store, this.requestService, this.proofService, this.ledger);
    this.revocationService = new ApprovalRevocationService(this.requestService, this.proofService, this.ledger);
  }

  /** Registers an actor's approver-recognition status for the default, store-backed recognition check (used when no actorRegistry integration is configured). */
  registerApproverRecognitionStatus(actorId: string, status: string): void {
    this.store.registerApproverRecognitionStatus(actorId, status);
  }

  createApprovalRequirement(input: Omit<ApprovalRequirement, 'id'> & { readonly id?: string }): ApprovalRequirement {
    const requirement: ApprovalRequirement = { ...input, id: input.id ?? this.ctx.ids.nextId('approval-requirement') };
    return this.store.putRequirement(requirement);
  }

  createApproverRule(input: Omit<ApproverRule, 'id'> & { readonly id?: string }): ApproverRule {
    const rule: ApproverRule = { ...input, id: input.id ?? this.ctx.ids.nextId('approver-rule') };
    return this.store.putApproverRule(rule);
  }

  createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
    return this.requestService.createApprovalRequest(input);
  }

  /**
   * Creates an ApprovalRequest from a Recognition Runtime decision. Reuses a
   * previously-registered ApprovalRequirement matching the trust domain and
   * action/scope when one exists; otherwise synthesizes a safe single-approval,
   * segregation-required default so the request/approve/verify loop still works
   * without requiring the caller to pre-register requirements.
   */
  createApprovalRequestForDecision(input: CreateApprovalRequestForDecisionInput): ApprovalRequestReference {
    const requirement = this.findMatchingRequirement(input) ?? this.createDefaultRequirement(input);
    const request = this.requestService.createApprovalRequest({
      trustDomainId: input.trustDomainId,
      actionRequestId: input.actionRequestId,
      recognitionDecisionId: input.recognitionDecisionId,
      requestedByActorId: input.requestedByActorId,
      targetActorId: input.targetActorId,
      action: input.action,
      resourceScope: input.resourceScope,
      riskLevel: input.riskLevel,
      requirement,
      evidence: [],
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
    });
    return { approvalRequestId: request.id, status: request.status };
  }

  private findMatchingRequirement(input: CreateApprovalRequestForDecisionInput): ApprovalRequirement | undefined {
    return this.store
      .getRequirementsByTrustDomain(input.trustDomainId)
      .find((requirement) => requirement.action === input.action && (requirement.resourceScope === input.resourceScope || requirement.resourceScope === '*'));
  }

  private createDefaultRequirement(input: CreateApprovalRequestForDecisionInput): ApprovalRequirement {
    return this.createApprovalRequirement({
      type: 'single_approval',
      trustDomainId: input.trustDomainId,
      action: input.action,
      resourceScope: input.resourceScope,
      riskLevel: input.riskLevel,
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: [],
    });
  }

  resolveApprovers(input: ResolveApproversInput): ApproverResolution {
    return this.resolutionService.resolveApprovers(input);
  }

  approve(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.decisionService.approve(input);
  }

  reject(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.decisionService.reject(input);
  }

  requestChanges(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.decisionService.requestChanges(input);
  }

  escalate(input: Omit<SubmitApprovalDecisionInput, 'type'>): ApprovalDecisionSubmissionResult {
    return this.decisionService.escalate(input);
  }

  expireApprovalRequest(approvalRequestId: string): ApprovalRequest | undefined {
    return this.expirationService.expireRequestIfNeeded(approvalRequestId);
  }

  revokeApproval(input: RevokeApprovalInput): ApprovalRequest | ApprovalProof {
    if (input.approvalProofId !== undefined) {
      return this.revocationService.revokeApprovalProof(input.approvalProofId, input.revokedByActorId, input.reason);
    }
    if (input.approvalRequestId !== undefined) {
      return this.revocationService.revokeApprovalRequest(input.approvalRequestId, input.revokedByActorId, input.reason);
    }
    throw new Error('revokeApproval requires either approvalRequestId or approvalProofId.');
  }

  getApprovalProof(approvalDecisionId: string): ApprovalProof | undefined {
    return this.proofService.getProofByDecisionId(approvalDecisionId);
  }

  getApprovalTrail(filter?: ApprovalEventTrailFilter): readonly ApprovalEvent[] {
    return this.ledger.getEventTrail(filter);
  }

  getApprovalDecision(approvalDecisionId: string): ApprovalDecision | undefined {
    return this.store.getDecision(approvalDecisionId);
  }

  /**
   * Verifies whether a valid, usable ApprovalProof exists for an action -- the
   * entry point Recognition Runtime calls through ApprovalRuntimeIntegration.
   */
  verifyApprovalForAction(input: ApprovalVerificationInput): ApprovalVerificationResult {
    const now = input.requestedAt;
    const resolved = this.resolveVerificationTarget(input);

    if (!resolved.request && !resolved.proof) {
      return this.finishVerification(input, {
        type: 'approval_missing',
        valid: false,
        reasonCode: 'APPROVAL_MISSING',
        reason: 'No approval request or proof was found for this action.',
      });
    }

    if (!resolved.proof) {
      const request = resolved.request as ApprovalRequest;
      if (request.status === 'pending') {
        const hasApprovedDecision = this.store.getDecisionsByRequestId(request.id).some((decision) => decision.type === 'approved');
        const result: ApprovalVerificationResult = hasApprovedDecision
          ? {
              type: 'approval_quorum_not_met',
              valid: false,
              reasonCode: 'APPROVAL_QUORUM_NOT_MET',
              reason: `Approval request ${request.id} has not yet reached the required number of approvals.`,
              approvalRequestId: request.id,
            }
          : {
              type: 'approval_missing',
              valid: false,
              reasonCode: 'APPROVAL_MISSING',
              reason: `Approval request ${request.id} is still pending; no approval decision has been made.`,
              approvalRequestId: request.id,
            };
        return this.finishVerification(input, result);
      }

      const type = VERIFICATION_TYPE_BY_REQUEST_STATUS[request.status] ?? 'approval_invalid';
      return this.finishVerification(input, {
        type,
        valid: false,
        reasonCode: type.toUpperCase(),
        reason: `Approval request ${request.id} has status "${request.status}" and cannot recognize this action.`,
        approvalRequestId: request.id,
      });
    }

    const proof = resolved.proof;
    const verification = this.proofService.verifyApprovalProof(proof.id, now);
    if (!verification.valid) {
      const type: ApprovalVerificationResultType =
        verification.reasonCode === 'APPROVAL_REVOKED' ? 'approval_revoked' : verification.reasonCode === 'APPROVAL_EXPIRED' ? 'approval_expired' : 'approval_invalid';
      return this.finishVerification(input, {
        type,
        valid: false,
        reasonCode: verification.reasonCode,
        reason: verification.reason,
        approvalRequestId: proof.approvalRequestId,
        approvalDecisionId: proof.approvalDecisionId,
        approvalProofId: proof.id,
      });
    }

    if (proof.action !== input.action || proof.resourceScope !== input.resourceScope) {
      return this.finishVerification(input, {
        type: 'approval_out_of_scope',
        valid: false,
        reasonCode: 'APPROVAL_OUT_OF_SCOPE',
        reason: `Approval proof ${proof.id} does not cover action "${input.action}" on scope "${input.resourceScope}".`,
        approvalRequestId: proof.approvalRequestId,
        approvalDecisionId: proof.approvalDecisionId,
        approvalProofId: proof.id,
      });
    }

    return this.finishVerification(input, {
      type: 'approval_valid',
      valid: true,
      reasonCode: 'APPROVAL_VALID',
      reason: `Approval proof ${proof.id} is valid for this action.`,
      approvalRequestId: proof.approvalRequestId,
      approvalDecisionId: proof.approvalDecisionId,
      approvalProofId: proof.id,
    });
  }

  private resolveVerificationTarget(input: ApprovalVerificationInput): { readonly request?: ApprovalRequest; readonly proof?: ApprovalProof } {
    if (input.approvalProofId !== undefined) {
      const proof = this.store.getProof(input.approvalProofId);
      if (!proof) {
        return {};
      }
      const request = this.store.getRequest(proof.approvalRequestId);
      return { proof, ...(request !== undefined ? { request } : {}) };
    }
    if (input.approvalDecisionId !== undefined) {
      const proof = this.store.getProofByDecisionId(input.approvalDecisionId);
      const decision = this.store.getDecision(input.approvalDecisionId);
      const request = decision ? this.store.getRequest(decision.approvalRequestId) : undefined;
      return { ...(proof !== undefined ? { proof } : {}), ...(request !== undefined ? { request } : {}) };
    }
    if (input.approvalRequestId !== undefined) {
      const request = this.store.getRequest(input.approvalRequestId);
      if (!request) {
        return {};
      }
      const proof = this.latestProofForRequest(request.id);
      return { request, ...(proof !== undefined ? { proof } : {}) };
    }

    const candidates = this.store
      .getRequestsByActionRequestId(input.actionRequestId)
      .filter((request) => request.trustDomainId === input.trustDomainId && request.action === input.action && request.resourceScope === input.resourceScope);
    const request = candidates.at(-1);
    if (!request) {
      return {};
    }
    const proof = this.latestProofForRequest(request.id);
    return { request, ...(proof !== undefined ? { proof } : {}) };
  }

  private latestProofForRequest(approvalRequestId: string): ApprovalProof | undefined {
    return this.store.getProofsByRequestId(approvalRequestId).at(-1);
  }

  private finishVerification(input: ApprovalVerificationInput, result: ApprovalVerificationResult): ApprovalVerificationResult {
    this.ledger.recordEvent({
      type: result.valid ? 'approval_verified' : 'approval_verification_failed',
      trustDomainId: input.trustDomainId,
      actionRequestId: input.actionRequestId,
      actorId: input.actorId,
      ...(result.approvalRequestId !== undefined ? { approvalRequestId: result.approvalRequestId } : {}),
      ...(result.approvalDecisionId !== undefined ? { approvalDecisionId: result.approvalDecisionId } : {}),
      ...(result.approvalProofId !== undefined ? { approvalProofId: result.approvalProofId } : {}),
      payload: { type: result.type, reasonCode: result.reasonCode },
    });
    return result;
  }
}

export function createApprovalRuntime(ctx: ApprovalRuntimeContext, options?: ApprovalRuntimeOptions): ApprovalRuntime {
  return new ApprovalRuntime(ctx, options);
}
